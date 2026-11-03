package com.hyperlog.rp

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

/**
 * HyperLogDatabase — The Private Offline Filing Cabinet on Your Phone!
 *
 * Uses Android's built-in SQLite engine (`hyperlog_offline_rp.db`, schema v8) with
 * Write-Ahead Logging (WAL) turned ON so reading charts and saving workout sets can
 * happen at the exact same time with zero lag and zero internet required.
 */
class HyperLogDatabase(
    context: Context,
    val dbFileName: String = resolveActiveUserDbName(context)
) : SQLiteOpenHelper(context.applicationContext, dbFileName, null, 10) {

    private val appContext: Context = context.applicationContext
    val isGuestVault: Boolean = (dbFileName == DEFAULT_GUEST_DB)

    // 24-entry LRU slice cache for fast First-10 login & +10 scroll-to-load pagination
    private val librarySliceCache = object : LinkedHashMap<String, List<LibraryExercise>>(32, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, List<LibraryExercise>>?): Boolean {
            return size > 24
        }
    }

    init {
        // WAL mode lets background threads snapshot backups without blocking finger taps!
        setWriteAheadLoggingEnabled(true)
    }

    @Synchronized
    fun invalidateLibraryCache() {
        librarySliceCache.clear()
    }

    companion object {
        private const val PREFS_ACCOUNTS = "hyperlog_accounts"
        private const val KEY_ACTIVE_UID = "active_uid"
        private const val KEY_ACCOUNTS_JSON = "accounts_json"
        const val DEFAULT_GUEST_DB = "hyperlog_offline_rp.db"

        @Volatile
        private var instance: HyperLogDatabase? = null

        fun guestProfile(): UserAccountProfile = UserAccountProfile(
            uid = "guest",
            displayName = "Guest Local Vault",
            email = "device-local@offline",
            provider = "Guest",
            dbFileName = DEFAULT_GUEST_DB
        )

        fun getSavedAccounts(context: Context): List<UserAccountProfile> {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_ACCOUNTS, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_ACCOUNTS_JSON, null)
            val list = mutableListOf(guestProfile())
            if (!raw.isNullOrBlank()) {
                runCatching {
                    val arr = JSONArray(raw)
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        val uid = o.optString("uid", "").trim()
                        if (uid.isNotEmpty() && uid != "guest") {
                            list.add(
                                UserAccountProfile(
                                    uid = uid,
                                    displayName = o.optString("displayName", "Athlete"),
                                    email = o.optString("email", ""),
                                    provider = o.optString("provider", "Email"),
                                    dbFileName = o.optString("dbFileName", "hyperlog_user_${uid}.db")
                                )
                            )
                        }
                    }
                }
            }
            return list
        }

        private fun persistSavedAccounts(context: Context, accounts: List<UserAccountProfile>, activeUid: String) {
            val arr = JSONArray()
            accounts.filter { it.uid != "guest" }.forEach { acc ->
                arr.put(
                    JSONObject()
                        .put("uid", acc.uid)
                        .put("displayName", acc.displayName)
                        .put("email", acc.email)
                        .put("provider", acc.provider)
                        .put("dbFileName", acc.dbFileName)
                )
            }
            context.applicationContext
                .getSharedPreferences(PREFS_ACCOUNTS, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_ACCOUNTS_JSON, arr.toString())
                .putString(KEY_ACTIVE_UID, activeUid)
                .apply()
        }

        fun getActiveAccount(context: Context): UserAccountProfile {
            val prefs = context.applicationContext.getSharedPreferences(PREFS_ACCOUNTS, Context.MODE_PRIVATE)
            val activeUid = prefs.getString(KEY_ACTIVE_UID, "guest") ?: "guest"
            val accounts = getSavedAccounts(context)
            return accounts.firstOrNull { it.uid == activeUid } ?: guestProfile()
        }

        fun resolveActiveUserDbName(context: Context): String {
            return getActiveAccount(context).dbFileName
        }

        fun getPrefsNameForActiveUser(context: Context): String {
            val acc = getActiveAccount(context)
            return if (acc.uid == "guest") "hyperlog_prefs" else "hyperlog_prefs_u_${acc.uid}"
        }

        fun getPrefsForActiveUser(context: Context): android.content.SharedPreferences {
            return context.applicationContext.getSharedPreferences(
                getPrefsNameForActiveUser(context),
                Context.MODE_PRIVATE
            )
        }

        /** Singleton pattern: ensures the whole app shares ONE safe database connection for the active user vault. */
        fun getInstance(context: Context): HyperLogDatabase {
            val targetDb = resolveActiveUserDbName(context)
            val cur = instance
            if (cur != null && cur.dbFileName == targetDb) return cur
            return synchronized(this) {
                val again = instance
                if (again != null && again.dbFileName == targetDb) {
                    again
                } else {
                    runCatching { again?.close() }
                    HyperLogDatabase(context.applicationContext, targetDb).also { instance = it }
                }
            }
        }

        fun switchActiveAccount(context: Context, uid: String): HyperLogDatabase {
            val accounts = getSavedAccounts(context)
            val chosen = accounts.firstOrNull { it.uid == uid } ?: guestProfile()
            persistSavedAccounts(context, accounts, chosen.uid)
            return getInstance(context)
        }

        fun registerOrSignInAccount(
            context: Context,
            displayName: String,
            email: String,
            provider: String
        ): HyperLogDatabase {
            val cleanEmail = email.trim().lowercase(Locale.US)
            val baseKey = cleanEmail.ifEmpty { displayName.trim().lowercase(Locale.US) }
                .replace(Regex("[^a-z0-9]+"), "_")
                .trim('_')
                .take(28)
                .ifEmpty { "user_${System.currentTimeMillis() % 100000}" }
            val existing = getSavedAccounts(context).toMutableList()
            val matchIdx = existing.indexOfFirst {
                it.uid != "guest" && (
                    (cleanEmail.isNotEmpty() && it.email.equals(cleanEmail, ignoreCase = true)) ||
                        it.uid == baseKey
                    )
            }
            val profile = if (matchIdx >= 0) {
                existing[matchIdx].copy(
                    displayName = displayName.trim().ifEmpty { existing[matchIdx].displayName },
                    provider = provider
                ).also { existing[matchIdx] = it }
            } else {
                UserAccountProfile(
                    uid = baseKey,
                    displayName = displayName.trim().ifEmpty { cleanEmail.substringBefore("@").ifEmpty { "Athlete" } },
                    email = cleanEmail,
                    provider = provider,
                    dbFileName = "hyperlog_user_${baseKey}.db"
                ).also { existing.add(it) }
            }
            persistSavedAccounts(context, existing, profile.uid)
            return getInstance(context)
        }

        fun deleteAccountVault(context: Context, uid: String): HyperLogDatabase {
            if (uid == "guest") {
                val guestDb = getInstance(context)
                guestDb.resetToDefaults()
                return guestDb
            }
            val existing = getSavedAccounts(context).toMutableList()
            val removed = existing.firstOrNull { it.uid == uid }
            val remaining = existing.filterNot { it.uid == uid }
            synchronized(this) {
                if (instance?.dbFileName == removed?.dbFileName) {
                    runCatching { instance?.close() }
                    instance = null
                }
                if (removed != null) {
                    runCatching { context.applicationContext.deleteDatabase(removed.dbFileName) }
                }
            }
            runCatching {
                context.applicationContext
                    .getSharedPreferences("hyperlog_prefs_u_$uid", Context.MODE_PRIVATE)
                    .edit()
                    .clear()
                    .apply()
            }
            persistSavedAccounts(context, remaining, "guest")
            return getInstance(context)
        }
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE muscle_landmarks (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                shortName TEXT NOT NULL,
                majorGroup TEXT NOT NULL,
                plane TEXT NOT NULL,
                mv INTEGER NOT NULL,
                mev INTEGER NOT NULL,
                mavMin INTEGER NOT NULL,
                mavMax INTEGER NOT NULL,
                mrv INTEGER NOT NULL,
                freqMin REAL NOT NULL,
                freqMax REAL NOT NULL,
                guidance TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE workout_days (
                dayNumber INTEGER PRIMARY KEY,
                title TEXT NOT NULL,
                focusSummary TEXT NOT NULL,
                isRestDay INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE day_exercises (
                id TEXT PRIMARY KEY,
                dayNumber INTEGER NOT NULL,
                orderIndex INTEGER NOT NULL,
                muscleId TEXT NOT NULL,
                name TEXT NOT NULL,
                isSuperset INTEGER NOT NULL,
                repRange TEXT NOT NULL,
                defaultWeightKg REAL NOT NULL,
                restSeconds INTEGER NOT NULL,
                w1Sets INTEGER NOT NULL,
                w2Sets INTEGER NOT NULL,
                w3Sets INTEGER NOT NULL,
                w4Sets INTEGER NOT NULL,
                w5Sets INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE set_logs (
                id TEXT PRIMARY KEY,
                week INTEGER NOT NULL,
                dayNumber INTEGER NOT NULL,
                templateSessionId TEXT,
                exerciseId TEXT NOT NULL,
                exerciseName TEXT NOT NULL,
                muscleId TEXT NOT NULL,
                setIndex INTEGER NOT NULL,
                weightKg REAL NOT NULL,
                reps INTEGER NOT NULL,
                rir REAL NOT NULL,
                restSeconds INTEGER NOT NULL,
                completed INTEGER NOT NULL,
                completedDateIso TEXT,
                rpe REAL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX idx_set_logs_wk_day ON set_logs(week, dayNumber, muscleId)")
        db.execSQL("CREATE INDEX idx_set_logs_date ON set_logs(completedDateIso)")

        db.execSQL("""
            CREATE TABLE muscle_feedback (
                id TEXT PRIMARY KEY,
                week INTEGER NOT NULL,
                muscleId TEXT NOT NULL,
                pumpScore INTEGER NOT NULL,
                jointPainScore INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE workout_templates (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                category TEXT NOT NULL,
                splitType TEXT NOT NULL,
                description TEXT NOT NULL,
                exercisesJson TEXT NOT NULL,
                updatedAtEpochMs INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE library_exercises (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                majorGroup TEXT NOT NULL,
                primaryMuscle TEXT NOT NULL,
                secondaryMusclesCsv TEXT NOT NULL,
                equipment TEXT NOT NULL,
                description TEXT NOT NULL,
                instructionsText TEXT NOT NULL,
                defaultRepRange TEXT NOT NULL,
                defaultRestSeconds INTEGER NOT NULL,
                defaultWeightKg REAL NOT NULL,
                videoUrl TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE meal_logs (
                id TEXT PRIMARY KEY,
                dateIso TEXT NOT NULL,
                mealType TEXT NOT NULL,
                name TEXT NOT NULL,
                calories INTEGER NOT NULL,
                proteinG INTEGER NOT NULL,
                carbsG INTEGER NOT NULL,
                fatG INTEGER NOT NULL,
                loggedAtEpochMs INTEGER NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE daily_metrics (
                dateIso TEXT PRIMARY KEY,
                bodyweightKg REAL NOT NULL,
                steps INTEGER NOT NULL,
                phase TEXT NOT NULL,
                baseTdee INTEGER NOT NULL,
                proteinPerKg REAL NOT NULL
            )
        """.trimIndent())

        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        createV6TablesIfNeeded(db)
        createV8TablesIfNeeded(db)
        createV9TablesIfNeeded(db)
        createV10TablesIfNeeded(db)
        seedDefaultsIntoDb(db)
    }

    private fun createV3TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS saved_custom_meals (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                mealType TEXT NOT NULL,
                calories INTEGER NOT NULL,
                proteinG INTEGER NOT NULL,
                carbsG INTEGER NOT NULL,
                fatG INTEGER NOT NULL,
                ingredientsSummary TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS activity_days (
                dateIso TEXT PRIMARY KEY,
                workoutLogged INTEGER NOT NULL,
                nutritionLogged INTEGER NOT NULL
            )
        """.trimIndent())
    }

    private fun createV5TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS workout_day_notes (
                dateIso TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                durationMinutes INTEGER NOT NULL,
                notes TEXT NOT NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_set_logs_date ON set_logs(completedDateIso)")
    }

    private fun createV6TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS wellbeing_logs (
                dateIso TEXT PRIMARY KEY,
                waterMl INTEGER NOT NULL,
                sleepHours REAL NOT NULL,
                energyScore INTEGER NOT NULL,
                stressScore INTEGER NOT NULL,
                sorenessScore INTEGER NOT NULL,
                breathMinutes INTEGER NOT NULL,
                mobilityMinutes INTEGER NOT NULL,
                notes TEXT NOT NULL
            )
        """.trimIndent())

        db.execSQL("""
            CREATE TABLE IF NOT EXISTS health_sync_logs (
                id TEXT PRIMARY KEY,
                syncedAtEpochMs INTEGER NOT NULL,
                summary TEXT NOT NULL,
                setsCount INTEGER NOT NULL,
                tonnageKg REAL NOT NULL,
                status TEXT NOT NULL
            )
        """.trimIndent())
    }

    /**
     * Schema v8: Creates the `user_feedback` table so beta testers can record star ratings,
     * bug reports, and feature ideas directly on their Android device (even in Airplane Mode!).
     */
    private fun createV8TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS user_feedback (
                id TEXT PRIMARY KEY,
                rating INTEGER NOT NULL,
                category TEXT NOT NULL,
                message TEXT NOT NULL,
                deviceInfo TEXT NOT NULL,
                createdAtEpochMs INTEGER NOT NULL,
                createdAtIso TEXT NOT NULL
            )
        """.trimIndent())
    }

    /**
     * Schema v9: Creates the `offline_videos` table indexing downloaded workout demo videos
     * saved inside `filesDir/HyperLogData/videos/offline_saved/` for 100% Airplane Mode playback.
     */
    private fun createV9TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS offline_videos (
                exerciseId TEXT PRIMARY KEY,
                exerciseName TEXT NOT NULL,
                primaryMuscle TEXT NOT NULL,
                majorGroup TEXT NOT NULL,
                equipment TEXT NOT NULL,
                modality TEXT NOT NULL,
                motionPattern TEXT NOT NULL,
                localFilePath TEXT NOT NULL,
                fileSizeBytes INTEGER NOT NULL,
                durationSec INTEGER NOT NULL,
                coachingStepsJson TEXT NOT NULL,
                videoUrl TEXT NOT NULL,
                downloadedAtEpochMs INTEGER NOT NULL,
                downloadedAtIso TEXT NOT NULL
            )
        """.trimIndent())
    }

    /**
     * Schema v10: Day-Zero Structured Telemetry (`app_event_logs`) bounded ring-buffer table.
     */
    private fun createV10TablesIfNeeded(db: SQLiteDatabase) {
        db.execSQL("""
            CREATE TABLE IF NOT EXISTS app_event_logs (
                id TEXT PRIMARY KEY,
                timestampIso TEXT NOT NULL,
                epochMs INTEGER NOT NULL,
                dayZeroOffsetMin REAL NOT NULL,
                level TEXT NOT NULL,
                category TEXT NOT NULL,
                event TEXT NOT NULL,
                durationMs INTEGER,
                metadataJson TEXT NOT NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX IF NOT EXISTS idx_app_event_logs_epoch ON app_event_logs(epochMs DESC)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 3) {
            createV3TablesIfNeeded(db)
            db.beginTransaction()
            try {
                for (scm in SeedCatalog.defaultSavedCustomMeals()) {
                    upsertSavedCustomMealInternal(db, scm)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 4) {
            createV3TablesIfNeeded(db)
            runCatching {
                db.execSQL("ALTER TABLE set_logs ADD COLUMN completedDateIso TEXT")
            }
            val today = LocalDate.now()
            db.beginTransaction()
            try {
                db.execSQL(
                    "UPDATE set_logs SET completedDateIso = ? WHERE completed = 1 AND id LIKE 'w3_d1_%'",
                    arrayOf(today.minusDays(3).toString())
                )
                db.execSQL(
                    "UPDATE set_logs SET completedDateIso = ? WHERE completed = 1 AND id LIKE 'w3_d2_%'",
                    arrayOf(today.minusDays(2).toString())
                )
                db.execSQL(
                    "UPDATE set_logs SET completedDateIso = ? WHERE completed = 1 AND id LIKE 'w3_d4_%'",
                    arrayOf(today.minusDays(1).toString())
                )
                db.execSQL(
                    "UPDATE set_logs SET completedDateIso = ? WHERE completed = 1 AND (completedDateIso IS NULL OR completedDateIso = '')",
                    arrayOf(today.toString())
                )
                db.execSQL("UPDATE set_logs SET completedDateIso = NULL WHERE completed = 0")
                db.execSQL("DELETE FROM meal_logs WHERE id IN ('seed_meal_1', 'seed_meal_2')")
                db.execSQL("DELETE FROM activity_days")
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 5) {
            runCatching {
                db.execSQL("ALTER TABLE set_logs ADD COLUMN rpe REAL")
            }
            createV5TablesIfNeeded(db)
            db.beginTransaction()
            try {
                val exs = SeedCatalog.defaultDayExercises()
                for (histSet in SeedCatalog.defaultHistoricalProgressionSetLogs(exs)) {
                    upsertSetLogInternal(db, histSet, conflictAlgorithm = SQLiteDatabase.CONFLICT_IGNORE)
                }
                db.execSQL("UPDATE set_logs SET rpe = ROUND(10.0 - rir, 1) WHERE completed = 1 AND rpe IS NULL")
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 6) {
            createV6TablesIfNeeded(db)
            db.beginTransaction()
            try {
                for (lib in SeedCatalog.defaultLibraryExercises()) {
                    val cv = ContentValues().apply {
                        put("id", lib.id); put("name", lib.name); put("majorGroup", lib.majorGroup)
                        put("primaryMuscle", lib.primaryMuscle); put("secondaryMusclesCsv", lib.secondaryMusclesCsv)
                        put("equipment", lib.equipment); put("description", lib.description)
                        put("instructionsText", lib.instructionsText); put("defaultRepRange", lib.defaultRepRange)
                        put("defaultRestSeconds", lib.defaultRestSeconds); put("defaultWeightKg", lib.defaultWeightKg)
                        put("videoUrl", lib.videoUrl)
                    }
                    db.insertWithOnConflict("library_exercises", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                for (tpl in SeedCatalog.defaultStarterTemplates()) {
                    val cv = ContentValues().apply {
                        put("id", tpl.id); put("name", tpl.name); put("category", tpl.category)
                        put("splitType", tpl.splitType); put("description", tpl.description)
                        put("exercisesJson", tpl.exercisesJson); put("updatedAtEpochMs", tpl.updatedAtEpochMs)
                    }
                    db.insertWithOnConflict("workout_templates", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 7) {
            createV3TablesIfNeeded(db)
            createV5TablesIfNeeded(db)
            createV6TablesIfNeeded(db)
            db.beginTransaction()
            try {
                for (tpl in SeedCatalog.defaultStarterTemplates()) {
                    val cv = ContentValues().apply {
                        put("id", tpl.id); put("name", tpl.name); put("category", tpl.category)
                        put("splitType", tpl.splitType); put("description", tpl.description)
                        put("exercisesJson", tpl.exercisesJson); put("updatedAtEpochMs", tpl.updatedAtEpochMs)
                    }
                    db.insertWithOnConflict("workout_templates", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                for (scm in SeedCatalog.defaultSavedCustomMeals()) {
                    val cv = ContentValues().apply {
                        put("id", scm.id); put("name", scm.name); put("mealType", scm.mealType)
                        put("calories", scm.calories); put("proteinG", scm.proteinG)
                        put("carbsG", scm.carbsG); put("fatG", scm.fatG)
                        put("ingredientsSummary", scm.ingredientsSummary)
                    }
                    db.insertWithOnConflict("saved_custom_meals", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 8) {
            createV8TablesIfNeeded(db)
            // Backfill newly added Forearm & Grip exercises and templates without touching user logs!
            db.beginTransaction()
            try {
                for (lib in SeedCatalog.defaultLibraryExercises()) {
                    val cv = ContentValues().apply {
                        put("id", lib.id); put("name", lib.name); put("majorGroup", lib.majorGroup)
                        put("primaryMuscle", lib.primaryMuscle); put("secondaryMusclesCsv", lib.secondaryMusclesCsv)
                        put("equipment", lib.equipment); put("description", lib.description)
                        put("instructionsText", lib.instructionsText); put("defaultRepRange", lib.defaultRepRange)
                        put("defaultRestSeconds", lib.defaultRestSeconds); put("defaultWeightKg", lib.defaultWeightKg)
                        put("videoUrl", lib.videoUrl)
                    }
                    db.insertWithOnConflict("library_exercises", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                for (tpl in SeedCatalog.defaultStarterTemplates()) {
                    val cv = ContentValues().apply {
                        put("id", tpl.id); put("name", tpl.name); put("category", tpl.category)
                        put("splitType", tpl.splitType); put("description", tpl.description)
                        put("exercisesJson", tpl.exercisesJson); put("updatedAtEpochMs", tpl.updatedAtEpochMs)
                    }
                    db.insertWithOnConflict("workout_templates", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
        if (oldVersion < 9) {
            createV9TablesIfNeeded(db)
        }
        if (oldVersion < 10) {
            createV10TablesIfNeeded(db)
            // v4.0 Day-Zero Clean-Slate Migration: Purge all legacy test/demo seed logs
            // while preserving custom exercises, templates, and downloaded offline videos!
            db.beginTransaction()
            try {
                listOf(
                    "set_logs",
                    "muscle_feedback",
                    "meal_logs",
                    "daily_metrics",
                    "activity_days",
                    "workout_day_notes",
                    "wellbeing_logs",
                    "health_sync_logs"
                ).forEach { db.delete(it, null, null) }
                materializeWeek1Day1SlotsInternal(db, SeedCatalog.defaultDayExercises())
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
    }

    private fun materializeWeek1Day1SlotsInternal(db: SQLiteDatabase, exs: List<DayExercise>) {
        val weekMeta = MESOCYCLE_WEEKS.first() // Week 1 · Day 1 clean baseline
        for (ex in exs.filter { it.dayNumber == 1 }) {
            val count = ex.setsForWeek(1)
            val defaultReps = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
            for (s in 1..count) {
                upsertSetLogInternal(
                    db,
                    SetLog(
                        "w1_d1_${ex.id}_s$s",
                        1,
                        1,
                        null,
                        ex.id,
                        ex.name,
                        ex.muscleId,
                        s,
                        ex.defaultWeightKg,
                        defaultReps,
                        weekMeta.defaultRirNumber,
                        ex.restSeconds,
                        false,
                        null,
                        null
                    )
                )
            }
        }
    }

    private fun seedDefaultsIntoDb(db: SQLiteDatabase) {
        db.beginTransaction()
        try {
            // Reference catalogs (anatomy landmarks, exercises, starter templates) are available to every profile
            for (lm in SeedCatalog.defaultLandmarks()) upsertLandmarkInternal(db, lm)
            for (d in SeedCatalog.defaultWorkoutDays()) upsertWorkoutDayInternal(db, d)
            val exs = SeedCatalog.defaultDayExercises()
            for (ex in exs) upsertDayExerciseInternal(db, ex)
            for (lib in SeedCatalog.defaultLibraryExercises()) upsertLibraryExerciseInternal(db, lib)
            for (tpl in SeedCatalog.defaultStarterTemplates()) upsertTemplateInternal(db, tpl)
            for (scm in SeedCatalog.defaultSavedCustomMeals()) {
                upsertSavedCustomMealInternal(db, scm)
            }

            // Day-Zero Clean Slate for EVERY vault (Guest & Signed-In):
            // Zero completed sets, zero prior streaks, zero meals, neutral 70kg baseline,
            // and uncompleted Week 1 · Day 1 slots ready to log from Day Zero!
            materializeWeek1Day1SlotsInternal(db, exs)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    /**
     * Wipes all personal workout history, streaks, weight records, and logged meals for the active user
     * while preserving custom exercises, workout templates, and downloaded offline videos.
     */
    fun clearPersonalLogsToFreshState() {
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        createV6TablesIfNeeded(db)
        createV8TablesIfNeeded(db)
        createV9TablesIfNeeded(db)
        createV10TablesIfNeeded(db)
        db.beginTransaction()
        try {
            listOf(
                "set_logs",
                "muscle_feedback",
                "meal_logs",
                "daily_metrics",
                "activity_days",
                "workout_day_notes",
                "wellbeing_logs",
                "health_sync_logs"
            ).forEach { db.delete(it, null, null) }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        ensureDaySetRowsMaterialized(1, 1)
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun resetToDefaults() {
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        createV6TablesIfNeeded(db)
        createV8TablesIfNeeded(db)
        createV9TablesIfNeeded(db)
        createV10TablesIfNeeded(db)
        db.beginTransaction()
        try {
            listOf(
                "set_logs",
                "day_exercises",
                "workout_days",
                "muscle_landmarks",
                "muscle_feedback",
                "workout_templates",
                "library_exercises",
                "meal_logs",
                "daily_metrics",
                "saved_custom_meals",
                "activity_days",
                "workout_day_notes",
                "wellbeing_logs",
                "health_sync_logs",
                "app_event_logs"
            ).forEach { db.delete(it, null, null) }
            seedDefaultsIntoDb(db)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        invalidateLibraryCache()
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    private fun upsertLandmarkInternal(db: SQLiteDatabase, lm: MuscleLandmark) {
        val cv = ContentValues().apply {
            put("id", lm.id); put("name", lm.name); put("shortName", lm.shortName)
            put("majorGroup", lm.majorGroup); put("plane", lm.plane)
            put("mv", lm.mv); put("mev", lm.mev); put("mavMin", lm.mavMin)
            put("mavMax", lm.mavMax); put("mrv", lm.mrv)
            put("freqMin", lm.freqMin); put("freqMax", lm.freqMax)
            put("guidance", lm.guidance)
        }
        db.insertWithOnConflict("muscle_landmarks", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertWorkoutDayInternal(db: SQLiteDatabase, d: WorkoutDay) {
        val cv = ContentValues().apply {
            put("dayNumber", d.dayNumber); put("title", d.title)
            put("focusSummary", d.focusSummary); put("isRestDay", if (d.isRestDay) 1 else 0)
        }
        db.insertWithOnConflict("workout_days", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertDayExerciseInternal(db: SQLiteDatabase, ex: DayExercise) {
        val cv = ContentValues().apply {
            put("id", ex.id); put("dayNumber", ex.dayNumber); put("orderIndex", ex.orderIndex)
            put("muscleId", ex.muscleId); put("name", ex.name); put("isSuperset", if (ex.isSuperset) 1 else 0)
            put("repRange", ex.repRange); put("defaultWeightKg", ex.defaultWeightKg); put("restSeconds", ex.restSeconds)
            put("w1Sets", ex.w1Sets); put("w2Sets", ex.w2Sets); put("w3Sets", ex.w3Sets)
            put("w4Sets", ex.w4Sets); put("w5Sets", ex.w5Sets)
        }
        db.insertWithOnConflict("day_exercises", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun sanitizeSetLog(s: SetLog): SetLog {
        val safeW = if (s.weightKg.isFinite() && s.weightKg >= 0.0) {
            ((s.weightKg.coerceAtMost(2500.0)) * 10000.0).roundToInt() / 10000.0
        } else {
            0.0
        }
        val safeReps = s.reps.coerceIn(1, 999)
        val safeRir = if (s.rir.isFinite()) {
            ((s.rir.coerceIn(0.0, 5.0)) * 2.0).roundToInt() / 2.0
        } else {
            2.0
        }
        val safeRpe = s.rpe?.takeIf { it.isFinite() }?.let {
            ((it.coerceIn(1.0, 10.0)) * 2.0).roundToInt() / 2.0
        }
        val safeRest = s.restSeconds.coerceIn(5, 900)
        return s.copy(
            setIndex = s.setIndex.coerceAtLeast(1),
            weightKg = safeW,
            reps = safeReps,
            rir = safeRir,
            restSeconds = safeRest,
            rpe = safeRpe
        )
    }

    private fun upsertSetLogInternal(
        db: SQLiteDatabase,
        s: SetLog,
        conflictAlgorithm: Int = SQLiteDatabase.CONFLICT_REPLACE
    ) {
        val clean = sanitizeSetLog(s)
        val cv = ContentValues().apply {
            put("id", clean.id); put("week", clean.week); put("dayNumber", clean.dayNumber)
            if (clean.templateSessionId != null) put("templateSessionId", clean.templateSessionId) else putNull("templateSessionId")
            put("exerciseId", clean.exerciseId); put("exerciseName", clean.exerciseName); put("muscleId", clean.muscleId)
            put("setIndex", clean.setIndex); put("weightKg", clean.weightKg); put("reps", clean.reps)
            put("rir", clean.rir); put("restSeconds", clean.restSeconds); put("completed", if (clean.completed) 1 else 0)
            val dateVal = if (clean.completed) clean.completedDateIso?.takeIf { it.isNotBlank() } else null
            if (dateVal != null) put("completedDateIso", dateVal) else putNull("completedDateIso")
            if (clean.rpe != null) put("rpe", clean.rpe) else putNull("rpe")
        }
        db.insertWithOnConflict("set_logs", null, cv, conflictAlgorithm)
    }

    private fun upsertTemplateInternal(db: SQLiteDatabase, t: WorkoutTemplate) {
        val cv = ContentValues().apply {
            put("id", t.id); put("name", t.name); put("category", t.category)
            put("splitType", t.splitType); put("description", t.description)
            put("exercisesJson", t.exercisesJson); put("updatedAtEpochMs", t.updatedAtEpochMs)
        }
        db.insertWithOnConflict("workout_templates", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertLibraryExerciseInternal(db: SQLiteDatabase, l: LibraryExercise) {
        val cv = ContentValues().apply {
            put("id", l.id); put("name", l.name); put("majorGroup", l.majorGroup)
            put("primaryMuscle", l.primaryMuscle); put("secondaryMusclesCsv", l.secondaryMusclesCsv)
            put("equipment", l.equipment); put("description", l.description)
            put("instructionsText", l.instructionsText); put("defaultRepRange", l.defaultRepRange)
            put("defaultRestSeconds", l.defaultRestSeconds); put("defaultWeightKg", l.defaultWeightKg)
            put("videoUrl", l.videoUrl)
        }
        db.insertWithOnConflict("library_exercises", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        invalidateLibraryCache()
    }

    private fun upsertMealInternal(db: SQLiteDatabase, m: MealLog) {
        val cv = ContentValues().apply {
            put("id", m.id); put("dateIso", m.dateIso); put("mealType", m.mealType)
            put("name", m.name); put("calories", m.calories); put("proteinG", m.proteinG)
            put("carbsG", m.carbsG); put("fatG", m.fatG); put("loggedAtEpochMs", m.loggedAtEpochMs)
        }
        db.insertWithOnConflict("meal_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertSavedCustomMealInternal(db: SQLiteDatabase, scm: SavedCustomMeal) {
        val cv = ContentValues().apply {
            put("id", scm.id); put("name", scm.name); put("mealType", scm.mealType)
            put("calories", scm.calories); put("proteinG", scm.proteinG)
            put("carbsG", scm.carbsG); put("fatG", scm.fatG)
            put("ingredientsSummary", scm.ingredientsSummary)
        }
        db.insertWithOnConflict("saved_custom_meals", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun upsertDailyMetricsInternal(db: SQLiteDatabase, dm: DailyMetrics) {
        val cv = ContentValues().apply {
            put("dateIso", dm.dateIso); put("bodyweightKg", dm.bodyweightKg)
            put("steps", dm.steps); put("phase", dm.phase)
            put("baseTdee", dm.baseTdee); put("proteinPerKg", dm.proteinPerKg)
        }
        db.insertWithOnConflict("daily_metrics", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun recordActivityInternal(db: SQLiteDatabase, dateIso: String, workout: Boolean, nutrition: Boolean) {
        var curW = false
        var curN = false
        db.rawQuery("SELECT workoutLogged, nutritionLogged FROM activity_days WHERE dateIso = ?", arrayOf(dateIso)).use { c ->
            if (c.moveToFirst()) {
                curW = c.getInt(0) == 1
                curN = c.getInt(1) == 1
            }
        }
        val cv = ContentValues().apply {
            put("dateIso", dateIso)
            put("workoutLogged", if (curW || workout) 1 else 0)
            put("nutritionLogged", if (curN || nutrition) 1 else 0)
        }
        db.insertWithOnConflict("activity_days", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun recordWorkoutActivityToday() {
        recordActivityInternal(writableDatabase, LocalDate.now().toString(), workout = true, nutrition = false)
    }

    fun recordNutritionActivity(dateIso: String) {
        recordActivityInternal(writableDatabase, dateIso, workout = false, nutrition = true)
    }

    // Public CRUD Readers & Writers
    fun getLandmarks(): Map<String, MuscleLandmark> {
        val map = linkedMapOf<String, MuscleLandmark>()
        readableDatabase.rawQuery("SELECT * FROM muscle_landmarks ORDER BY name ASC", null).use { c ->
            while (c.moveToNext()) {
                val lm = MuscleLandmark(
                    c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
                    c.getInt(5), c.getInt(6), c.getInt(7), c.getInt(8), c.getInt(9),
                    c.getDouble(10), c.getDouble(11), c.getString(12)
                )
                map[lm.id] = lm
            }
        }
        return map
    }

    fun saveLandmark(lm: MuscleLandmark) = upsertLandmarkInternal(writableDatabase, lm)

    fun getWorkoutDays(): List<WorkoutDay> {
        val out = mutableListOf<WorkoutDay>()
        readableDatabase.rawQuery("SELECT * FROM workout_days ORDER BY dayNumber ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(WorkoutDay(c.getInt(0), c.getString(1), c.getString(2), c.getInt(3) == 1))
            }
        }
        return out
    }

    fun getDayExercises(): List<DayExercise> {
        val out = mutableListOf<DayExercise>()
        readableDatabase.rawQuery("SELECT * FROM day_exercises ORDER BY dayNumber ASC, orderIndex ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(DayExercise(
                    c.getString(0), c.getInt(1), c.getInt(2), c.getString(3), c.getString(4),
                    c.getInt(5) == 1, c.getString(6), c.getDouble(7), c.getInt(8),
                    c.getInt(9), c.getInt(10), c.getInt(11), c.getInt(12), c.getInt(13)
                ))
            }
        }
        return out
    }

    fun getSetLogs(): List<SetLog> {
        val out = mutableListOf<SetLog>()
        readableDatabase.rawQuery(
            "SELECT id, week, dayNumber, templateSessionId, exerciseId, exerciseName, muscleId, setIndex, weightKg, reps, rir, restSeconds, completed, completedDateIso, rpe FROM set_logs ORDER BY week ASC, dayNumber ASC, setIndex ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                out.add(SetLog(
                    c.getString(0), c.getInt(1), c.getInt(2),
                    if (c.isNull(3)) null else c.getString(3),
                    c.getString(4), c.getString(5), c.getString(6),
                    c.getInt(7), c.getDouble(8), c.getInt(9), c.getDouble(10), c.getInt(11),
                    c.getInt(12) == 1,
                    if (c.isNull(13)) null else c.getString(13),
                    if (c.isNull(14)) null else c.getDouble(14)
                ))
            }
        }
        return out
    }

    fun getCompletedSetsByDateDesc(): Map<String, List<SetLog>> {
        val grouped = linkedMapOf<String, MutableList<SetLog>>()
        readableDatabase.rawQuery(
            "SELECT id, week, dayNumber, templateSessionId, exerciseId, exerciseName, muscleId, setIndex, weightKg, reps, rir, restSeconds, completed, completedDateIso, rpe FROM set_logs WHERE completed = 1 AND completedDateIso IS NOT NULL AND completedDateIso != '' ORDER BY completedDateIso DESC, dayNumber ASC, setIndex ASC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                val dIso = c.getString(13)
                val row = SetLog(
                    c.getString(0), c.getInt(1), c.getInt(2),
                    if (c.isNull(3)) null else c.getString(3),
                    c.getString(4), c.getString(5), c.getString(6),
                    c.getInt(7), c.getDouble(8), c.getInt(9), c.getDouble(10), c.getInt(11),
                    c.getInt(12) == 1,
                    dIso,
                    if (c.isNull(14)) null else c.getDouble(14)
                )
                grouped.getOrPut(dIso) { mutableListOf() }.add(row)
            }
        }
        return grouped
    }

    fun getCompletedSetsForDate(dateIso: String): List<SetLog> {
        val out = mutableListOf<SetLog>()
        readableDatabase.rawQuery(
            "SELECT id, week, dayNumber, templateSessionId, exerciseId, exerciseName, muscleId, setIndex, weightKg, reps, rir, restSeconds, completed, completedDateIso, rpe FROM set_logs WHERE completed = 1 AND completedDateIso = ? ORDER BY dayNumber ASC, exerciseName ASC, setIndex ASC",
            arrayOf(dateIso)
        ).use { c ->
            while (c.moveToNext()) {
                out.add(SetLog(
                    c.getString(0), c.getInt(1), c.getInt(2),
                    if (c.isNull(3)) null else c.getString(3),
                    c.getString(4), c.getString(5), c.getString(6),
                    c.getInt(7), c.getDouble(8), c.getInt(9), c.getDouble(10), c.getInt(11),
                    c.getInt(12) == 1,
                    if (c.isNull(13)) null else c.getString(13),
                    if (c.isNull(14)) null else c.getDouble(14)
                ))
            }
        }
        return out
    }

    fun getWorkoutDayNotesMap(): Map<String, WorkoutDayNote> {
        createV5TablesIfNeeded(writableDatabase)
        val out = linkedMapOf<String, WorkoutDayNote>()
        readableDatabase.rawQuery("SELECT dateIso, title, durationMinutes, notes FROM workout_day_notes", null).use { c ->
            while (c.moveToNext()) {
                val n = WorkoutDayNote(c.getString(0), c.getString(1), c.getInt(2), c.getString(3))
                out[n.dateIso] = n
            }
        }
        return out
    }

    fun saveWorkoutDayNote(note: WorkoutDayNote) {
        val db = writableDatabase
        createV5TablesIfNeeded(db)
        val cv = ContentValues().apply {
            put("dateIso", note.dateIso)
            put("title", note.title)
            put("durationMinutes", note.durationMinutes)
            put("notes", note.notes)
        }
        db.insertWithOnConflict("workout_day_notes", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun logManualWorkoutForDate(dateIso: String, title: String, durationMin: Int, notes: String, sets: List<SetLog>) {
        val db = writableDatabase
        createV5TablesIfNeeded(db)
        db.beginTransaction()
        try {
            saveWorkoutDayNoteInternal(db, WorkoutDayNote(dateIso, title, durationMin, notes))
            for (s in sets) {
                upsertSetLogInternal(db, s.copy(completed = true, completedDateIso = dateIso))
            }
            recordActivityInternal(db, dateIso, workout = true, nutrition = false)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    /**
     * Deletes an entire workout session logged on [dateIso] (used when correcting mistakenly entered workouts).
     * Planned mesocycle slots on [dateIso] are cleanly unchecked rather than orphaned, while standalone/manual
     * rows and session notes are removed and streaks are immediately recalculated.
     */
    fun deleteWorkoutSessionForDate(dateIso: String): Int {
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        val removedCount = getCompletedSetsForDate(dateIso).size
        db.beginTransaction()
        try {
            db.delete(
                "set_logs",
                "completed = 1 AND completedDateIso = ? AND templateSessionId IS NOT NULL",
                arrayOf(dateIso)
            )
            val resetCv = ContentValues().apply {
                put("completed", 0)
                putNull("completedDateIso")
                putNull("rpe")
            }
            db.update(
                "set_logs",
                resetCv,
                "completed = 1 AND completedDateIso = ? AND templateSessionId IS NULL",
                arrayOf(dateIso)
            )
            db.delete("workout_day_notes", "dateIso = ?", arrayOf(dateIso))
            syncActivityDayWorkoutFlagInternal(db, dateIso)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        return removedCount
    }

    /**
     * Deletes mistakenly entered sets for a single [exerciseName] on [dateIso], cleaning up the day note
     * and streak flag automatically if no other exercises remain on that date.
     */
    fun deleteExerciseLogsForDate(dateIso: String, exerciseName: String): Int {
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        val matching = getCompletedSetsForDate(dateIso).count {
            it.exerciseName.equals(exerciseName, ignoreCase = true)
        }
        db.beginTransaction()
        try {
            db.delete(
                "set_logs",
                "completed = 1 AND completedDateIso = ? AND LOWER(exerciseName) = LOWER(?) AND templateSessionId IS NOT NULL",
                arrayOf(dateIso, exerciseName)
            )
            val resetCv = ContentValues().apply {
                put("completed", 0)
                putNull("completedDateIso")
                putNull("rpe")
            }
            db.update(
                "set_logs",
                resetCv,
                "completed = 1 AND completedDateIso = ? AND LOWER(exerciseName) = LOWER(?) AND templateSessionId IS NULL",
                arrayOf(dateIso, exerciseName)
            )
            val remaining = db.rawQuery(
                "SELECT COUNT(*) FROM set_logs WHERE completed = 1 AND completedDateIso = ?",
                arrayOf(dateIso)
            ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }
            if (remaining <= 0) {
                db.delete("workout_day_notes", "dateIso = ?", arrayOf(dateIso))
            }
            syncActivityDayWorkoutFlagInternal(db, dateIso)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        return matching
    }

    private fun syncActivityDayWorkoutFlagInternal(db: SQLiteDatabase, dateIso: String) {
        val remainingSets = db.rawQuery(
            "SELECT COUNT(*) FROM set_logs WHERE completed = 1 AND completedDateIso = ?",
            arrayOf(dateIso)
        ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }
        val hasWorkout = if (remainingSets > 0) 1 else 0
        val existingNut = db.rawQuery(
            "SELECT nutritionLogged FROM activity_days WHERE dateIso = ?",
            arrayOf(dateIso)
        ).use { c -> if (c.moveToFirst()) c.getInt(0) else 0 }
        if (hasWorkout == 0 && existingNut == 0) {
            db.delete("activity_days", "dateIso = ?", arrayOf(dateIso))
        } else {
            val cv = ContentValues().apply {
                put("dateIso", dateIso)
                put("workoutLogged", hasWorkout)
                put("nutritionLogged", existingNut)
            }
            db.insertWithOnConflict("activity_days", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        }
    }

    /**
     * Computes pure workout history & consistency streak metrics for the active user vault.
     */
    fun getWorkoutHistoryAnalytics(): WorkoutHistoryAnalytics {
        val today = LocalDate.now()
        val todayIso = today.toString()
        val byDate = getCompletedSetsByDateDesc()
        val notesMap = getWorkoutDayNotesMap()
        val workoutDates = byDate.keys

        var cursor = if (todayIso in workoutDates) today else today.minusDays(1)
        var currentStreak = 0
        while (cursor.toString() in workoutDates) {
            currentStreak += 1
            cursor = cursor.minusDays(1)
        }

        val sortedDates = workoutDates.mapNotNull {
            try { LocalDate.parse(it) } catch (_: Exception) { null }
        }.sorted()

        var bestStreak = currentStreak
        var run = 0
        var prev: LocalDate? = null
        for (d in sortedDates) {
            run = if (prev != null && prev.plusDays(1) == d) run + 1 else 1
            if (run > bestStreak) bestStreak = run
            prev = d
        }

        val cutoff7 = today.minusDays(6)
        val cutoff30 = today.minusDays(29)
        val count7d = sortedDates.count { !it.isBefore(cutoff7) && !it.isAfter(today) }
        val count30d = sortedDates.count { !it.isBefore(cutoff30) && !it.isAfter(today) }

        val avgPerWeek = if (sortedDates.isEmpty()) {
            0.0
        } else {
            val earliest = sortedDates.first()
            val spanDays = (java.time.temporal.ChronoUnit.DAYS.between(earliest, today) + 1L).coerceAtLeast(7L)
            val weeks = spanDays / 7.0
            ((sortedDates.size / weeks) * 10.0).roundToInt() / 10.0
        }

        var totalDurationMin = 0
        var totalSets = 0
        var totalTonnage = 0.0
        for ((dIso, sets) in byDate) {
            val explicitDur = notesMap[dIso]?.durationMinutes?.takeIf { it > 0 }
            val estDur = explicitDur ?: (sets.size * 3 + 12).coerceIn(15, 120)
            totalDurationMin += estDur
            totalSets += sets.size
            totalTonnage += sets.sumOf { it.weightKg * it.reps }
        }
        val avgDurationMin = if (byDate.isNotEmpty()) {
            (totalDurationMin.toDouble() / byDate.size).roundToInt()
        } else 0

        val last14 = (13 downTo 0).map { offset ->
            val dt = today.minusDays(offset.toLong())
            val dIso = dt.toString()
            val lbl = dt.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.US).take(2)
            Triple(dIso, lbl, dIso in workoutDates)
        }

        return WorkoutHistoryAnalytics(
            currentWorkoutStreakDays = currentStreak,
            bestWorkoutStreakDays = bestStreak,
            totalWorkoutsAllTime = byDate.size,
            workoutsLast7Days = count7d,
            workoutsLast30Days = count30d,
            avgWorkoutsPerWeek = avgPerWeek,
            totalDurationMinutes = totalDurationMin,
            avgDurationMinutes = avgDurationMin,
            totalSetsAllTime = totalSets,
            totalTonnageKg = totalTonnage,
            last14DaysConsistency = last14
        )
    }

    // -------------------------------------------------------------------------
    // Offline Demo Video Index (`offline_videos` table)
    // -------------------------------------------------------------------------
    fun saveOfflineVideoEntry(entry: OfflineDemoVideoEntry) {
        val db = writableDatabase
        createV9TablesIfNeeded(db)
        val cv = ContentValues().apply {
            put("exerciseId", entry.exerciseId)
            put("exerciseName", entry.exerciseName)
            put("primaryMuscle", entry.primaryMuscle)
            put("majorGroup", entry.majorGroup)
            put("equipment", entry.equipment)
            put("modality", entry.modality)
            put("motionPattern", entry.motionPattern)
            put("localFilePath", entry.localFilePath)
            put("fileSizeBytes", entry.fileSizeBytes)
            put("durationSec", entry.durationSec)
            put("coachingStepsJson", entry.coachingStepsJson)
            put("videoUrl", entry.videoUrl)
            put("downloadedAtEpochMs", entry.downloadedAtEpochMs)
            put("downloadedAtIso", entry.downloadedAtIso)
        }
        db.insertWithOnConflict("offline_videos", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getOfflineVideoEntries(): List<OfflineDemoVideoEntry> {
        createV9TablesIfNeeded(writableDatabase)
        val out = mutableListOf<OfflineDemoVideoEntry>()
        readableDatabase.rawQuery(
            "SELECT exerciseId, exerciseName, primaryMuscle, majorGroup, equipment, modality, motionPattern, localFilePath, fileSizeBytes, durationSec, coachingStepsJson, videoUrl, downloadedAtEpochMs, downloadedAtIso FROM offline_videos ORDER BY downloadedAtEpochMs DESC",
            null
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    OfflineDemoVideoEntry(
                        exerciseId = c.getString(0),
                        exerciseName = c.getString(1),
                        primaryMuscle = c.getString(2),
                        majorGroup = c.getString(3),
                        equipment = c.getString(4),
                        modality = c.getString(5),
                        motionPattern = c.getString(6),
                        localFilePath = c.getString(7),
                        fileSizeBytes = c.getLong(8),
                        durationSec = c.getInt(9),
                        coachingStepsJson = c.getString(10),
                        videoUrl = c.getString(11),
                        downloadedAtEpochMs = c.getLong(12),
                        downloadedAtIso = c.getString(13)
                    )
                )
            }
        }
        return out
    }

    fun isExerciseSavedOffline(exerciseId: String): Boolean {
        createV9TablesIfNeeded(writableDatabase)
        return readableDatabase.rawQuery(
            "SELECT 1 FROM offline_videos WHERE exerciseId = ? LIMIT 1",
            arrayOf(exerciseId)
        ).use { c -> c.moveToFirst() }
    }

    fun deleteOfflineVideoEntry(exerciseId: String) {
        val db = writableDatabase
        createV9TablesIfNeeded(db)
        db.delete("offline_videos", "exerciseId = ?", arrayOf(exerciseId))
    }

    private fun saveWorkoutDayNoteInternal(db: SQLiteDatabase, note: WorkoutDayNote) {
        val cv = ContentValues().apply {
            put("dateIso", note.dateIso)
            put("title", note.title)
            put("durationMinutes", note.durationMinutes)
            put("notes", note.notes)
        }
        db.insertWithOnConflict("workout_day_notes", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun normalizeExKey(raw: String): String {
        return raw.lowercase(Locale.US)
            .replace(Regex("\\s+\\d+$"), "")
            .replace(Regex("\\s+ss$"), "")
            .replace(Regex("\\(ss\\)"), "")
            .replace("sl deadlift", "stiff-legged deadlift")
            .replace("glute bridge", "barbell glute bridge")
            .replace("overhead ez extension", "overhead ez bar extension")
            .replace(Regex("[^a-z0-9]"), "")
    }

    fun findLatestCompletedSetForExercise(
        exerciseId: String,
        exerciseName: String,
        excludeSessionId: String? = null
    ): SetLog? {
        val targetNorm = normalizeExKey(exerciseName)
        val completed = getSetLogs().filter { s ->
            if (!s.completed) return@filter false
            if (excludeSessionId != null && s.templateSessionId == excludeSessionId) return@filter false
            val sNorm = normalizeExKey(s.exerciseName)
            s.exerciseId == exerciseId ||
                s.exerciseName.equals(exerciseName, ignoreCase = true) ||
                (targetNorm.length >= 5 && sNorm == targetNorm)
        }
        if (completed.isEmpty()) return null
        return completed.sortedWith(
            compareBy<SetLog> { it.completedDateIso ?: "" }
                .thenBy { it.week }
                .thenBy { it.setIndex }
        ).lastOrNull()
    }

    /**
     * Returns up to [limit] most recently completed sets for [exerciseId] / [exerciseName]
     * so tapping the Tracker's History icon opens a clean mini-modal of the previous 3 sets performed.
     */
    fun getRecentCompletedSetsForExercise(
        exerciseId: String,
        exerciseName: String,
        limit: Int = 3
    ): List<SetLog> {
        val targetNorm = normalizeExKey(exerciseName)
        val completed = getSetLogs().filter { s ->
            if (!s.completed) return@filter false
            val sNorm = normalizeExKey(s.exerciseName)
            s.exerciseId == exerciseId ||
                s.exerciseName.equals(exerciseName, ignoreCase = true) ||
                (targetNorm.length >= 5 && sNorm == targetNorm)
        }
        if (completed.isEmpty()) return emptyList()
        val newestFirst = completed.sortedWith(
            compareByDescending<SetLog> { it.completedDateIso ?: "" }
                .thenByDescending { it.week }
                .thenByDescending { it.dayNumber }
                .thenByDescending { it.setIndex }
        ).take(limit.coerceIn(1, 10))

        val first = newestFirst.first()
        val sameSession = newestFirst.size > 1 && newestFirst.all { s ->
            if (first.templateSessionId != null) {
                s.templateSessionId == first.templateSessionId
            } else {
                s.completedDateIso == first.completedDateIso &&
                    s.week == first.week &&
                    s.dayNumber == first.dayNumber
            }
        }
        return if (sameSession) newestFirst.sortedBy { it.setIndex } else newestFirst
    }

    fun getExerciseProgressionHistory(lib: LibraryExercise): List<ExerciseSessionPoint> {
        val targetNorm = normalizeExKey(lib.name)
        val targetBase = lib.name.lowercase(Locale.US).trim()
        val matchingSets = getSetLogs().filter { s ->
            if (!s.completed || s.completedDateIso.isNullOrBlank()) return@filter false
            val sNorm = normalizeExKey(s.exerciseName)
            s.exerciseId == lib.id ||
                s.exerciseName.equals(lib.name, ignoreCase = true) ||
                sNorm == targetNorm ||
                (targetNorm.length >= 6 && (sNorm.contains(targetNorm) || targetNorm.contains(sNorm))) ||
                s.exerciseName.lowercase(Locale.US).startsWith(targetBase)
        }
        if (matchingSets.isEmpty()) return emptyList()

        val fmt = DateTimeFormatter.ofPattern("MMM d", Locale.US)
        val byDate = matchingSets.groupBy { it.completedDateIso!! }
        return byDate.entries
            .sortedBy { it.key }
            .takeLast(10)
            .map { (dIso, rows) ->
                val topW = rows.maxOf { it.weightKg }
                val avgW = rows.map { it.weightKg }.average()
                val est1Rm = rows.maxOf { r ->
                    val w = r.weightKg
                    if (w <= 0.0) 0.0 else w * (1.0 + r.reps.coerceAtLeast(1) / 30.0)
                }
                val rpeVals = rows.mapNotNull { it.rpe }
                val shortLbl = try {
                    LocalDate.parse(dIso).format(fmt)
                } catch (_: Exception) {
                    dIso.takeLast(5)
                }
                ExerciseSessionPoint(
                    dateIso = dIso,
                    shortLabel = shortLbl,
                    topWeightKg = (topW * 10.0).roundToInt() / 10.0,
                    avgWeightKg = (avgW * 10.0).roundToInt() / 10.0,
                    est1RmKg = (est1Rm * 10.0).roundToInt() / 10.0,
                    totalSets = rows.size,
                    bestReps = rows.maxOf { it.reps },
                    avgRpe = if (rpeVals.isNotEmpty()) (rpeVals.average() * 10.0).roundToInt() / 10.0 else null
                )
            }
    }

    fun exportAllWorkoutsCsv(weightUnit: String): String {
        val byDate = getCompletedSetsByDateDesc()
        val notesMap = getWorkoutDayNotesMap()
        val landmarks = getLandmarks()
        val sb = StringBuilder()
        sb.append("Date,SessionTitle,Exercise,Muscle,Set,Weight,Unit,Reps,RIR,RPE,VolumeLoad,Notes\n")
        fun esc(v: String): String = "\"${v.replace("\"", "\"\"")}\""
        for ((dIso, sets) in byDate) {
            val note = notesMap[dIso]
            val title = note?.title?.takeIf { it.isNotBlank() }
                ?: sets.firstOrNull()?.let { if (it.dayNumber > 0) "Week ${it.week} Day ${it.dayNumber}" else "Workout" }
                ?: "Workout"
            val noteTxt = note?.notes ?: ""
            for (s in sets) {
                val dispW = if (weightUnit == "lb") (s.weightKg * 2.20462 * 10.0).roundToInt() / 10.0 else (s.weightKg * 10.0).roundToInt() / 10.0
                val vol = ((dispW * s.reps) * 10.0).roundToInt() / 10.0
                val mName = landmarks[s.muscleId]?.shortName ?: s.muscleId
                val rpeStr = s.rpe?.toString() ?: ""
                sb.append("$dIso,${esc(title)},${esc(s.exerciseName)},${esc(mName)},${s.setIndex},$dispW,$weightUnit,${s.reps},${s.rir},$rpeStr,$vol,${esc(noteTxt)}\n")
            }
        }
        return sb.toString()
    }

    fun saveSetLog(s: SetLog, notifyWidget: Boolean = true) {
        val db = writableDatabase
        val normalized = if (s.completed) {
            val dIso = s.completedDateIso?.takeIf { it.isNotBlank() } ?: LocalDate.now().toString()
            recordActivityInternal(db, dIso, workout = true, nutrition = false)
            s.copy(completedDateIso = dIso)
        } else {
            s.copy(completedDateIso = null)
        }
        upsertSetLogInternal(db, normalized)
        if (notifyWidget) {
            HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        }
    }

    fun completeSetsBatch(sets: List<SetLog>, dateIso: String = LocalDate.now().toString()): List<SetLog> {
        if (sets.isEmpty()) return emptyList()
        val db = writableDatabase
        val out = mutableListOf<SetLog>()
        db.beginTransaction()
        try {
            for (s in sets) {
                val done = s.copy(
                    completed = true,
                    completedDateIso = s.completedDateIso?.takeIf { it.isNotBlank() } ?: dateIso
                )
                upsertSetLogInternal(db, done)
                out.add(done)
            }
            recordActivityInternal(db, dateIso, workout = true, nutrition = false)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        return out
    }

    fun deleteSetLog(id: String, notifyWidget: Boolean = true) {
        writableDatabase.delete("set_logs", "id = ?", arrayOf(id))
        if (notifyWidget) {
            HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        }
    }

    fun ensureDaySetRowsMaterialized(week: Int, dayNumber: Int) {
        val exs = getDayExercises().filter { it.dayNumber == dayNumber }
        if (exs.isEmpty()) return
        val existing = getSetLogs().filter { it.week == week && it.dayNumber == dayNumber && it.templateSessionId == null }
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == week } ?: MESOCYCLE_WEEKS[2]
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (ex in exs) {
                if (existing.none { it.exerciseId == ex.id }) {
                    val count = ex.setsForWeek(week)
                    val lastDone = findLatestCompletedSetForExercise(ex.id, ex.name)
                    val defaultReps = lastDone?.reps ?: Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
                    val startW = lastDone?.weightKg ?: ex.defaultWeightKg
                    for (s in 1..count) {
                        upsertSetLogInternal(
                            db,
                            SetLog(
                                "w${week}_d${dayNumber}_${ex.id}_s$s", week, dayNumber, null,
                                ex.id, ex.name, ex.muscleId, s, startW, defaultReps,
                                weekMeta.defaultRirNumber, ex.restSeconds, false
                            )
                        )
                    }
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun computeSetLogsParitySignature(): String {
        val logs = getSetLogs()
        var hash = 2166136261L
        fun mix(str: String) {
            for (ch in str) {
                hash = hash xor ch.code.toLong()
                hash = (hash * 16777619L) and 0xFFFFFFFFL
            }
        }
        mix("n=${logs.size};")
        for (s in logs) {
            val wFixed = ((s.weightKg * 10000.0).roundToInt())
            val rirFixed = ((s.rir * 10.0).roundToInt())
            val rpeFixed = s.rpe?.let { (it * 10.0).roundToInt().toString() } ?: "-"
            mix("${s.id}|${s.week}|${s.dayNumber}|${s.templateSessionId ?: ""}|${s.setIndex}|$wFixed|${s.reps}|$rirFixed|$rpeFixed|${if (s.completed) 1 else 0};")
        }
        return "${logs.size}_${hash.toString(16)}"
    }

    fun verifyAndRepairSqliteParity(
        activeWeek: Int,
        activeDay: Int,
        standalone: StandaloneSession?
    ): Pair<Int, Int> {
        val allLogs = getSetLogs()
        var repaired = 0
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (row in allLogs) {
                val clean = sanitizeSetLog(row)
                if (clean != row) {
                    upsertSetLogInternal(db, clean)
                    repaired += 1
                }
            }
            if (standalone != null) {
                val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
                for (item in standalone.exercises) {
                    val exists = allLogs.any {
                        it.templateSessionId == standalone.sessionId && it.exerciseId == item.id
                    }
                    if (!exists) {
                        val repTarget = Regex("\\d+").find(item.reps)?.value?.toIntOrNull() ?: 10
                        for (sIdx in 1..item.sets.coerceAtLeast(1)) {
                            upsertSetLogInternal(
                                db,
                                SetLog(
                                    "${standalone.sessionId}_${item.id}_s$sIdx",
                                    activeWeek,
                                    0,
                                    standalone.sessionId,
                                    item.id,
                                    item.name,
                                    item.primaryMuscle,
                                    sIdx,
                                    item.defaultWeightKg,
                                    repTarget,
                                    weekMeta.defaultRirNumber,
                                    item.restSeconds,
                                    false
                                )
                            )
                            repaired += 1
                        }
                    }
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        if (standalone == null) {
            ensureDaySetRowsMaterialized(activeWeek, activeDay)
        }

        val refreshedLogs = getSetLogs()
        val activeSetsCount = if (standalone != null) {
            refreshedLogs.count { it.templateSessionId == standalone.sessionId }
        } else {
            refreshedLogs.count { it.templateSessionId == null && it.week == activeWeek && it.dayNumber == activeDay }
        }
        return repaired to activeSetsCount
    }

    fun getFeedbackMap(): Map<String, MuscleFeedback> {
        val map = mutableMapOf<String, MuscleFeedback>()
        readableDatabase.rawQuery("SELECT * FROM muscle_feedback", null).use { c ->
            while (c.moveToNext()) {
                val fb = MuscleFeedback(c.getString(0), c.getInt(1), c.getString(2), c.getInt(3), c.getInt(4))
                map[fb.id] = fb
            }
        }
        return map
    }

    fun saveFeedback(fb: MuscleFeedback) {
        val cv = ContentValues().apply {
            put("id", fb.id); put("week", fb.week); put("muscleId", fb.muscleId)
            put("pumpScore", fb.pumpScore); put("jointPainScore", fb.jointPainScore)
        }
        writableDatabase.insertWithOnConflict("muscle_feedback", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getTemplates(): List<WorkoutTemplate> {
        val out = mutableListOf<WorkoutTemplate>()
        readableDatabase.rawQuery("SELECT * FROM workout_templates ORDER BY category ASC, name ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(WorkoutTemplate(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4), c.getString(5), c.getLong(6)))
            }
        }
        return out
    }

    fun saveTemplate(t: WorkoutTemplate) = upsertTemplateInternal(writableDatabase, t)

    fun deleteTemplate(id: String) {
        writableDatabase.delete("workout_templates", "id = ?", arrayOf(id))
    }

    fun assignTemplateToDay(template: WorkoutTemplate, dayNumber: Int, activeWeek: Int) {
        val items = template.parsedExercises()
        val landmarks = getLandmarks()
        val focus = items.mapNotNull { landmarks[it.primaryMuscle]?.shortName }.distinct().joinToString(", ")
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]

        val db = writableDatabase
        db.beginTransaction()
        try {
            upsertWorkoutDayInternal(db, WorkoutDay(dayNumber, "Day $dayNumber · ${template.name}", focus.ifBlank { template.splitType }, false))
            db.delete("day_exercises", "dayNumber = ?", arrayOf(dayNumber.toString()))
            db.delete("set_logs", "week = ? AND dayNumber = ? AND completed = 0 AND templateSessionId IS NULL", arrayOf(activeWeek.toString(), dayNumber.toString()))

            items.forEachIndexed { idx, item ->
                val ex = DayExercise(
                    id = "d${dayNumber}_tpl_${System.currentTimeMillis()}_${idx + 1}",
                    dayNumber = dayNumber,
                    orderIndex = idx + 1,
                    muscleId = item.primaryMuscle,
                    name = item.name,
                    isSuperset = false,
                    repRange = item.reps,
                    defaultWeightKg = item.defaultWeightKg,
                    restSeconds = item.restSeconds,
                    w1Sets = item.sets,
                    w2Sets = item.sets,
                    w3Sets = (item.sets + 1).coerceAtMost(10),
                    w4Sets = (item.sets + 1).coerceAtMost(10),
                    w5Sets = (item.sets / 2).coerceAtLeast(1)
                )
                upsertDayExerciseInternal(db, ex)
                val targetSets = ex.setsForWeek(activeWeek)
                val repTarget = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
                for (s in 1..targetSets) {
                    upsertSetLogInternal(db, SetLog(
                        "w${activeWeek}_d${dayNumber}_${ex.id}_s$s", activeWeek, dayNumber, null,
                        ex.id, ex.name, ex.muscleId, s, ex.defaultWeightKg, repTarget,
                        weekMeta.defaultRirNumber, ex.restSeconds, false
                    ))
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun startStandaloneTemplate(template: WorkoutTemplate, activeWeek: Int): StandaloneSession {
        val items = template.parsedExercises()
        val sessionId = "standalone_${System.currentTimeMillis()}"
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (item in items) {
                val lastDone = findLatestCompletedSetForExercise(item.libraryExerciseId.ifBlank { item.id }, item.name)
                val repTarget = lastDone?.reps ?: Regex("\\d+").find(item.reps)?.value?.toIntOrNull() ?: 10
                val startW = lastDone?.weightKg ?: item.defaultWeightKg
                for (s in 1..item.sets) {
                    upsertSetLogInternal(db, SetLog(
                        "${sessionId}_${item.id}_s$s", activeWeek, 0, sessionId,
                        item.id, item.name, item.primaryMuscle, s, startW, repTarget,
                        weekMeta.defaultRirNumber, item.restSeconds, false
                    ))
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return StandaloneSession(sessionId, template.id, template.name, items)
    }

    fun startQuickEmptySession(customTitle: String = "Custom Workout"): StandaloneSession {
        val sessionId = "quick_${System.currentTimeMillis()}"
        return StandaloneSession(
            sessionId = sessionId,
            templateId = "quick_custom",
            templateName = customTitle.trim().ifBlank { "Custom Workout" },
            exercises = emptyList()
        )
    }

    fun appendExerciseToStandaloneSession(
        current: StandaloneSession,
        lib: LibraryExercise,
        activeWeek: Int
    ): StandaloneSession {
        val itemId = "ti_${System.currentTimeMillis()}"
        val lastDone = findLatestCompletedSetForExercise(lib.id, lib.name, excludeSessionId = current.sessionId)
        val startW = lastDone?.weightKg ?: lib.defaultWeightKg
        val repTarget = lastDone?.reps ?: Regex("\\d+").find(lib.defaultRepRange)?.value?.toIntOrNull() ?: 10
        val item = TemplateExerciseItem(
            id = itemId,
            libraryExerciseId = lib.id,
            name = lib.name,
            primaryMuscle = lib.primaryMuscle,
            sets = 3,
            reps = lib.defaultRepRange,
            restSeconds = lib.defaultRestSeconds,
            defaultWeightKg = startW
        )
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
        val db = writableDatabase
        db.beginTransaction()
        try {
            for (s in 1..3) {
                upsertSetLogInternal(
                    db,
                    SetLog(
                        "${current.sessionId}_${item.id}_s$s", activeWeek, 0, current.sessionId,
                        item.id, item.name, item.primaryMuscle, s, startW, repTarget,
                        weekMeta.defaultRirNumber, item.restSeconds, false
                    )
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return current.copy(exercises = current.exercises + item)
    }

    fun removeExerciseFromStandaloneSession(current: StandaloneSession, exerciseId: String): StandaloneSession {
        writableDatabase.delete(
            "set_logs",
            "templateSessionId = ? AND exerciseId = ? AND completed = 0",
            arrayOf(current.sessionId, exerciseId)
        )
        return current.copy(exercises = current.exercises.filterNot { it.id == exerciseId })
    }

    fun repeatDateWorkoutSession(
        title: String,
        sourceSets: List<SetLog>,
        activeWeek: Int
    ): StandaloneSession {
        val sessionId = "repeat_${System.currentTimeMillis()}"
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
        val grouped = sourceSets.groupBy { it.exerciseName }
        val items = mutableListOf<TemplateExerciseItem>()
        val db = writableDatabase
        db.beginTransaction()
        try {
            var idx = 0
            for ((exName, rows) in grouped) {
                idx += 1
                val first = rows.first()
                val sortedRows = rows.sortedBy { it.setIndex }
                val itemId = "rep_ex_${System.currentTimeMillis()}_$idx"
                val setCount = sortedRows.size.coerceIn(1, 10)
                val repStr = "${sortedRows.first().reps}"
                items.add(
                    TemplateExerciseItem(
                        id = itemId,
                        libraryExerciseId = first.exerciseId,
                        name = exName,
                        primaryMuscle = first.muscleId,
                        sets = setCount,
                        reps = repStr,
                        restSeconds = first.restSeconds,
                        defaultWeightKg = first.weightKg
                    )
                )
                sortedRows.forEachIndexed { sIdx, src ->
                    upsertSetLogInternal(
                        db,
                        SetLog(
                            "${sessionId}_${itemId}_s${sIdx + 1}",
                            activeWeek,
                            0,
                            sessionId,
                            itemId,
                            exName,
                            first.muscleId,
                            sIdx + 1,
                            src.weightKg,
                            src.reps,
                            src.rir.takeIf { it >= 0.0 } ?: weekMeta.defaultRirNumber,
                            first.restSeconds,
                            false,
                            null,
                            src.rpe
                        )
                    )
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        return StandaloneSession(sessionId, "repeat_history", title.ifBlank { "Repeated Workout" }, items)
    }

    fun appendExerciseToScheduleDay(dayNumber: Int, lib: LibraryExercise, activeWeek: Int) {
        val existing = getDayExercises().filter { it.dayNumber == dayNumber }
        val nextOrder = (existing.maxOfOrNull { it.orderIndex } ?: 0) + 1
        val lastDone = findLatestCompletedSetForExercise(lib.id, lib.name)
        val ex = DayExercise(
            "d${dayNumber}_custom_${System.currentTimeMillis()}", dayNumber, nextOrder,
            lib.primaryMuscle, lib.name, false, lib.defaultRepRange, lastDone?.weightKg ?: lib.defaultWeightKg, lib.defaultRestSeconds,
            3, 3, 4, 4, 2
        )
        upsertDayExerciseInternal(writableDatabase, ex)
        val day = getWorkoutDays().find { it.dayNumber == dayNumber }
        if (day != null && day.isRestDay) {
            upsertWorkoutDayInternal(writableDatabase, day.copy(isRestDay = false, title = "Day $dayNumber · Custom Hypertrophy"))
        }
        ensureDaySetRowsMaterialized(activeWeek, dayNumber)
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun removeDayExercise(exerciseId: String) {
        writableDatabase.delete("day_exercises", "id = ?", arrayOf(exerciseId))
        writableDatabase.delete("set_logs", "exerciseId = ? AND completed = 0 AND templateSessionId IS NULL", arrayOf(exerciseId))
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun getTotalLibraryExerciseCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM library_exercises", null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    /**
     * Prioritized Exercise Library query matching Web's Two-Phase Login Hydration:
     * 1) User Custom Exercises (`lib_custom_*`) first
     * 2) Recently logged movements (`set_logs` completed)
     * 3) Alphabetical (`name ASC`)
     * Supports fast First-10 login slice (`limit = 10, offset = 0`) + LRU slice cache.
     */
    @Synchronized
    fun getLibraryExercisesPrioritized(limit: Int? = null, offset: Int = 0): List<LibraryExercise> {
        val cacheKey = "prio_${limit ?: -1}_${offset}"
        librarySliceCache[cacheKey]?.let { return it }

        val sql = buildString {
            append(
                """
                SELECT le.id, le.name, le.majorGroup, le.primaryMuscle, le.secondaryMusclesCsv,
                       le.equipment, le.description, le.instructionsText, le.defaultRepRange,
                       le.defaultRestSeconds, le.defaultWeightKg, le.videoUrl
                FROM library_exercises le
                LEFT JOIN (
                    SELECT exerciseId, MAX(COALESCE(completedDateIso, '')) AS lastLoggedIso
                    FROM set_logs
                    WHERE completed = 1
                    GROUP BY exerciseId
                ) sl ON sl.exerciseId = le.id
                ORDER BY
                    CASE WHEN le.id LIKE 'lib_custom_%' THEN 0 ELSE 1 END ASC,
                    CASE WHEN sl.lastLoggedIso IS NOT NULL AND sl.lastLoggedIso != '' THEN 0 ELSE 1 END ASC,
                    sl.lastLoggedIso DESC,
                    le.name ASC
                """.trimIndent()
            )
            if (limit != null && limit > 0) {
                append(" LIMIT ${limit.coerceAtLeast(1)} OFFSET ${offset.coerceAtLeast(0)}")
            }
        }

        val out = mutableListOf<LibraryExercise>()
        readableDatabase.rawQuery(sql, null).use { c ->
            while (c.moveToNext()) {
                out.add(
                    LibraryExercise(
                        c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
                        c.getString(5), c.getString(6), c.getString(7), c.getString(8), c.getInt(9),
                        c.getDouble(10), c.getString(11)
                    )
                )
            }
        }
        librarySliceCache[cacheKey] = out
        return out
    }

    fun getLibraryExercises(): List<LibraryExercise> = getLibraryExercisesPrioritized(limit = null, offset = 0)

    fun saveLibraryExercise(lib: LibraryExercise) {
        upsertLibraryExerciseInternal(writableDatabase, lib)
        invalidateLibraryCache()
    }

    fun getMealsForDate(dateIso: String): List<MealLog> {
        val out = mutableListOf<MealLog>()
        readableDatabase.rawQuery("SELECT * FROM meal_logs WHERE dateIso = ? ORDER BY loggedAtEpochMs DESC", arrayOf(dateIso)).use { c ->
            while (c.moveToNext()) {
                out.add(MealLog(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getInt(4), c.getInt(5), c.getInt(6), c.getInt(7), c.getLong(8)))
            }
        }
        return out
    }

    private fun getAllMeals(): List<MealLog> {
        val out = mutableListOf<MealLog>()
        readableDatabase.rawQuery("SELECT * FROM meal_logs ORDER BY loggedAtEpochMs DESC", null).use { c ->
            while (c.moveToNext()) {
                out.add(MealLog(c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getInt(4), c.getInt(5), c.getInt(6), c.getInt(7), c.getLong(8)))
            }
        }
        return out
    }

    fun saveMeal(m: MealLog, notifyWidget: Boolean = true) {
        val db = writableDatabase
        upsertMealInternal(db, m)
        recordActivityInternal(db, m.dateIso, workout = false, nutrition = true)
        if (notifyWidget) {
            HyperLogStreakWidgetProvider.onMealSaved(appContext)
        }
    }

    fun deleteMeal(id: String, notifyWidget: Boolean = true) {
        val db = writableDatabase
        var deletedDateIso: String? = null
        db.rawQuery("SELECT dateIso FROM meal_logs WHERE id = ?", arrayOf(id)).use { c ->
            if (c.moveToFirst()) deletedDateIso = c.getString(0)
        }
        db.delete("meal_logs", "id = ?", arrayOf(id))
        if (deletedDateIso != null) {
            var remainingCount = 0
            db.rawQuery("SELECT COUNT(*) FROM meal_logs WHERE dateIso = ?", arrayOf(deletedDateIso)).use { c ->
                if (c.moveToFirst()) remainingCount = c.getInt(0)
            }
            if (remainingCount == 0) {
                val cv = ContentValues().apply { put("nutritionLogged", 0) }
                db.update("activity_days", cv, "dateIso = ?", arrayOf(deletedDateIso))
            }
        }
        if (notifyWidget) {
            HyperLogStreakWidgetProvider.onMealSaved(appContext)
        }
    }

    fun getSavedCustomMeals(): List<SavedCustomMeal> {
        val out = mutableListOf<SavedCustomMeal>()
        readableDatabase.rawQuery("SELECT * FROM saved_custom_meals ORDER BY name ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(SavedCustomMeal(
                    c.getString(0), c.getString(1), c.getString(2),
                    c.getInt(3), c.getInt(4), c.getInt(5), c.getInt(6), c.getString(7)
                ))
            }
        }
        return out
    }

    fun saveCustomMealPreset(scm: SavedCustomMeal) {
        upsertSavedCustomMealInternal(writableDatabase, scm)
        HyperLogStreakWidgetProvider.onMealSaved(appContext)
    }

    fun deleteCustomMealPreset(id: String) {
        writableDatabase.delete("saved_custom_meals", "id = ?", arrayOf(id))
        HyperLogStreakWidgetProvider.onMealSaved(appContext)
    }

    fun getDailyMetrics(dateIso: String): DailyMetrics {
        readableDatabase.rawQuery("SELECT * FROM daily_metrics WHERE dateIso = ?", arrayOf(dateIso)).use { c ->
            if (c.moveToNext()) {
                return DailyMetrics(c.getString(0), c.getDouble(1), c.getInt(2), c.getString(3), c.getInt(4), c.getDouble(5))
            }
        }
        // Inherit latest recorded metrics if present so applied calculator targets carry forward across dates
        readableDatabase.rawQuery("SELECT * FROM daily_metrics ORDER BY dateIso DESC LIMIT 1", null).use { c ->
            if (c.moveToNext()) {
                return DailyMetrics(dateIso, c.getDouble(1), c.getInt(2), c.getString(3), c.getInt(4), c.getDouble(5))
            }
        }
        return DailyMetrics(dateIso, 70.0, 0, "Maintenance", 2350, 1.8)
    }

    fun saveDailyMetrics(dm: DailyMetrics) {
        upsertDailyMetricsInternal(writableDatabase, dm)
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    /**
     * Returns chronological (dateIso, bodyweightKg, totalCalories) records over the last [days] days.
     * Strictly reflects real logged bodyweight & meals from Day Zero (zero synthetic test drift).
     */
    fun getNutritionWeightTrend(days: Int = 10): List<Triple<String, Double, Int>> {
        val cleanDays = days.coerceIn(7, 30)
        val today = LocalDate.now()
        val mealsByDate = getAllMeals().groupBy { it.dateIso }
        val explicitMetrics = mutableMapOf<String, DailyMetrics>()
        readableDatabase.rawQuery("SELECT * FROM daily_metrics ORDER BY dateIso ASC", null).use { c ->
            while (c.moveToNext()) {
                explicitMetrics[c.getString(0)] = DailyMetrics(
                    c.getString(0), c.getDouble(1), c.getInt(2), c.getString(3), c.getInt(4), c.getDouble(5)
                )
            }
        }
        val anchorMetrics = getDailyMetrics(today.toString())
        val baseWeight = anchorMetrics.bodyweightKg.takeIf { it > 25.0 } ?: 70.0
        val out = ArrayList<Triple<String, Double, Int>>(cleanDays)
        for (i in (cleanDays - 1) downTo 0) {
            val d = today.minusDays(i.toLong()).toString()
            val explicit = explicitMetrics[d]
            val dayMeals = mealsByDate[d].orEmpty()
            val wKg = explicit?.bodyweightKg ?: ((baseWeight * 10.0).roundToInt() / 10.0)
            val kcal = dayMeals.sumOf { it.calories }
            out.add(Triple(d, wKg, kcal))
        }
        return out
    }

    fun getWellbeingForDate(dateIso: String): WellbeingDailyRecord {
        createV6TablesIfNeeded(writableDatabase)
        readableDatabase.rawQuery(
            "SELECT dateIso, waterMl, sleepHours, energyScore, stressScore, sorenessScore, breathMinutes, mobilityMinutes, notes FROM wellbeing_logs WHERE dateIso = ?",
            arrayOf(dateIso)
        ).use { c ->
            if (c.moveToFirst()) {
                return WellbeingDailyRecord(
                    dateIso = c.getString(0),
                    waterMl = c.getInt(1),
                    sleepHours = c.getDouble(2),
                    energyScore = c.getInt(3),
                    stressScore = c.getInt(4),
                    sorenessScore = c.getInt(5),
                    breathMinutes = c.getInt(6),
                    mobilityMinutes = c.getInt(7),
                    notes = c.getString(8)
                )
            }
        }
        return WellbeingDailyRecord(
            dateIso = dateIso,
            waterMl = 0,
            sleepHours = 7.5,
            energyScore = 4,
            stressScore = 2,
            sorenessScore = 2,
            breathMinutes = 0,
            mobilityMinutes = 0,
            notes = ""
        )
    }

    fun saveWellbeingRecord(rec: WellbeingDailyRecord) {
        val db = writableDatabase
        createV6TablesIfNeeded(db)
        val cv = ContentValues().apply {
            put("dateIso", rec.dateIso)
            put("waterMl", rec.waterMl.coerceIn(0, 10000))
            put("sleepHours", rec.sleepHours.coerceIn(0.0, 16.0))
            put("energyScore", rec.energyScore.coerceIn(1, 5))
            put("stressScore", rec.stressScore.coerceIn(1, 5))
            put("sorenessScore", rec.sorenessScore.coerceIn(1, 5))
            put("breathMinutes", rec.breathMinutes.coerceIn(0, 300))
            put("mobilityMinutes", rec.mobilityMinutes.coerceIn(0, 300))
            put("notes", rec.notes)
        }
        db.insertWithOnConflict("wellbeing_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun logHealthConnectSync(summary: String, setsCount: Int, tonnageKg: Double, status: String) {
        val db = writableDatabase
        createV6TablesIfNeeded(db)
        val cv = ContentValues().apply {
            put("id", "hc_${System.currentTimeMillis()}")
            put("syncedAtEpochMs", System.currentTimeMillis())
            put("summary", summary)
            put("setsCount", setsCount)
            put("tonnageKg", tonnageKg)
            put("status", status)
        }
        db.insertWithOnConflict("health_sync_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun getRecentHealthConnectSyncs(limit: Int = 5): List<HealthConnectSyncRecord> {
        createV6TablesIfNeeded(writableDatabase)
        val out = mutableListOf<HealthConnectSyncRecord>()
        readableDatabase.rawQuery(
            "SELECT id, syncedAtEpochMs, summary, setsCount, tonnageKg, status FROM health_sync_logs ORDER BY syncedAtEpochMs DESC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    HealthConnectSyncRecord(
                        id = c.getString(0),
                        syncedAtEpochMs = c.getLong(1),
                        summary = c.getString(2),
                        setsCount = c.getInt(3),
                        tonnageKg = c.getDouble(4),
                        status = c.getString(5)
                    )
                )
            }
        }
        return out
    }

    /**
     * Standalone Mobile Data / Wi-Fi Online Catalog Pull:
     * Fetches 870+ exercises directly from open free-exercise-db JSON over HTTPS (zero backend dependency)
     * and caches them + 13 multi-modality workout programs permanently in local SQLite for offline use.
     */
    fun syncOnlineCatalogOverNetwork(): Triple<Int, Int, Int> {
        val existingIds = getLibraryExercises().map { it.id }.toSet()
        val endpoint = URL("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json")
        val conn = (endpoint.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 15000
            readTimeout = 25000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HyperLog-Android/2.5")
        }

        val rawJson = try {
            val code = conn.responseCode
            if (code !in 200..299) {
                throw IllegalStateException("HTTP $code while fetching online catalog")
            }
            BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
        } finally {
            conn.disconnect()
        }

        val arr = JSONArray(rawJson)
        val parsedExercises = mutableListOf<LibraryExercise>()

        fun mapMuscle(rawM: String, forcePull: Boolean): Pair<String, String> {
            return when (rawM.lowercase(Locale.US).trim()) {
                "chest" -> "chest" to "CHEST"
                "lats", "middle back", "lower back" -> "back" to "BACK"
                "traps", "neck" -> "traps" to "SHOULDERS"
                "shoulders" -> if (forcePull) "rear_side_delts" to "SHOULDERS" else "front_delts" to "SHOULDERS"
                "biceps" -> "biceps" to "ARMS"
                "triceps" -> "triceps" to "ARMS"
                "forearms" -> "forearms" to "ARMS"
                "abdominals" -> "abs" to "CORE"
                "quadriceps", "adductors" -> "quads" to "LEGS"
                "hamstrings" -> "hamstrings" to "LEGS"
                "glutes", "abductors" -> "glutes" to "LEGS"
                "calves" -> "calves" to "LEGS"
                else -> "back" to "BACK"
            }
        }

        fun mapEquipment(rawEq: String, rawCat: String, nameLower: String): String {
            val cat = rawCat.lowercase(Locale.US)
            if (nameLower.contains("yoga") || nameLower.contains("pose") || nameLower.contains("downward") || nameLower.contains("warrior")) {
                return "Yoga"
            }
            if (cat == "stretching") return "Stretching"
            if (cat == "cardio" || cat == "plyometrics") return "Cardio"
            return when (rawEq.lowercase(Locale.US).trim()) {
                "barbell" -> "Barbell"
                "dumbbell" -> "Dumbbell"
                "cable" -> "Cable"
                "machine" -> "Machine"
                "e-z curl bar" -> "EZ Bar"
                "kettlebells" -> "Kettlebells"
                "bands" -> "Bands"
                "medicine ball", "exercise ball" -> "Medicine Ball"
                "foam roll" -> "Stretching"
                else -> "Bodyweight"
            }
        }

        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val rawId = o.optString("id", "").trim()
            val name = o.optString("name", "").trim()
            if (rawId.isBlank() || name.isBlank()) continue

            val id = "web_${rawId.lowercase(Locale.US).replace(Regex("[^a-z0-9]+"), "_")}"
            val forcePull = o.optString("force", "").equals("pull", ignoreCase = true)
            val primArr = o.optJSONArray("primaryMuscles")
            val firstPrim = if (primArr != null && primArr.length() > 0) primArr.optString(0, "back") else "back"
            val (primaryMuscle, majorGroup) = mapMuscle(firstPrim, forcePull)

            val secSet = linkedSetOf<String>()
            val secArr = o.optJSONArray("secondaryMuscles")
            if (secArr != null) {
                for (j in 0 until secArr.length()) {
                    val mapped = mapMuscle(secArr.optString(j, ""), forcePull).first
                    if (mapped != primaryMuscle) secSet.add(mapped)
                }
            }

            val rawCategory = o.optString("category", "strength")
            val rawEquip = o.optString("equipment", "body only")
            val equip = mapEquipment(rawEquip, rawCategory, name.lowercase(Locale.US))

            val instArr = o.optJSONArray("instructions")
            val steps = mutableListOf<String>()
            if (instArr != null) {
                for (j in 0 until instArr.length()) {
                    val st = instArr.optString(j, "").trim()
                    if (st.isNotBlank()) steps.add(st)
                }
            }
            val instructionsText = if (steps.isNotEmpty()) {
                steps.take(5).joinToString("\n")
            } else {
                "Set stable posture and brace your core.\nControl the eccentric stretch for 2–3 seconds.\nDrive smoothly through target range of motion."
            }
            val desc = steps.firstOrNull()?.take(150)
                ?: "$equip movement targeting $primaryMuscle ($rawCategory)."

            val repRange = when (equip) {
                "Stretching", "Yoga" -> "45–60s"
                "Cardio" -> "60s / Zone 2"
                "Barbell" -> "6–10"
                else -> "10–15"
            }
            val restSec = when (equip) {
                "Stretching", "Yoga" -> 25
                "Cardio" -> 45
                "Barbell" -> 120
                else -> 75
            }
            val defW = when (equip) {
                "Barbell" -> 45.0
                "Dumbbell", "Kettlebells" -> 16.0
                "Machine", "Cable" -> 35.0
                "EZ Bar" -> 25.0
                else -> 0.0
            }
            val ytQuery = UriEncodeSafe("$name exercise form")

            parsedExercises.add(
                LibraryExercise(
                    id = id,
                    name = name,
                    majorGroup = majorGroup,
                    primaryMuscle = primaryMuscle,
                    secondaryMusclesCsv = secSet.joinToString(","),
                    equipment = equip,
                    description = desc,
                    instructionsText = instructionsText,
                    defaultRepRange = repRange,
                    defaultRestSeconds = restSec,
                    defaultWeightKg = defW,
                    videoUrl = "https://www.youtube.com/results?search_query=$ytQuery"
                )
            )
        }

        val now = System.currentTimeMillis()
        val onlineTemplates = listOf(
            WorkoutTemplate(
                "tpl_online_arnold_chest_back", "Arnold Split · Antagonist Chest & Back", "Online", "Arnold Split · 6x/Wk",
                "High-density antagonist superset hypertrophy pairing horizontal/incline presses with vertical/horizontal pulls.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("oa_1", "lib_bb_bench_press", "Barbell Bench Press", "chest", 4, "8–10", 120, 80.0),
                    TemplateExerciseItem("oa_2", "lib_pullups", "Pullups", "back", 4, "8–12", 120, 0.0),
                    TemplateExerciseItem("oa_3", "lib_incline_db_press", "Incline Dumbbell Press", "chest", 4, "10–12", 90, 30.0),
                    TemplateExerciseItem("oa_4", "lib_bb_bent_row", "Barbell Bent Row", "back", 4, "8–12", 90, 75.0),
                    TemplateExerciseItem("oa_5", "lib_cable_flies", "Cable Flies", "chest", 3, "12–15", 60, 20.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_phul_upper_power", "PHUL · Upper Power & Strength", "Online", "PHUL · 4x/Wk",
                "Power Hypertrophy Upper Lower heavy neural strength day focused on progressive compound overload.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("ph_1", "lib_bb_bench_press", "Barbell Bench Press", "chest", 4, "4–6", 180, 92.5),
                    TemplateExerciseItem("ph_2", "lib_bb_bent_row", "Barbell Bent Row", "back", 4, "5–6", 150, 87.5),
                    TemplateExerciseItem("ph_3", "lib_bb_standing_press", "Barbell Standing Press", "front_delts", 3, "5–8", 150, 57.5),
                    TemplateExerciseItem("ph_4", "lib_weighted_dips", "Weighted Dips", "triceps", 3, "6–10", 120, 20.0),
                    TemplateExerciseItem("ph_5", "lib_ez_bar_curl", "EZ Bar Curls", "biceps", 3, "6–10", 90, 35.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_gvt_legs_chest", "German Volume 10×10 Hypertrophy", "Online", "GVT · High Volume",
                "Classic 10 sets of 10 submaximal structural accumulation workout with strict 90s rest intervals.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("gv_1", "lib_incline_db_press", "Incline Dumbbell Press", "chest", 10, "10", 90, 24.0),
                    TemplateExerciseItem("gv_2", "lib_cable_rows", "Cable Rows", "back", 10, "10", 90, 55.0),
                    TemplateExerciseItem("gv_3", "lib_db_side_laterals", "Dumbbell Side Laterals", "rear_side_delts", 4, "15", 60, 10.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_calisthenics", "Zero-Equipment Calisthenics & Core", "Online", "Bodyweight · Anywhere",
                "Full-body bodyweight strength and core control requiring zero gym machines—ideal for travel or home.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("cal_1", "lib_pullups", "Pullups", "back", 4, "8–12", 90, 0.0),
                    TemplateExerciseItem("cal_2", "lib_wide_pushup", "Wide Grip Pushup", "chest", 4, "15–20", 75, 0.0),
                    TemplateExerciseItem("cal_3", "lib_hanging_knee_raise", "Hanging Knee Raises", "abs", 4, "12–20", 60, 0.0),
                    TemplateExerciseItem("cal_4", "lib_cardio_jump_rope", "Jump Rope Conditioning", "calves", 4, "60s", 45, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_kettlebell_cond", "Athletic Kettlebell & Conditioning", "Online", "Functional · 35 Min",
                "Explosive posterior-chain power, overhead stability, and metabolic work capacity.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("kb_1", "lib_sl_deadlift", "Stiff-Legged Deadlift", "hamstrings", 4, "10–12", 90, 60.0),
                    TemplateExerciseItem("kb_2", "lib_seated_db_ohp", "Seated Dumbbell Overhead Press", "front_delts", 4, "10–12", 75, 22.0),
                    TemplateExerciseItem("kb_3", "lib_cardio_hiit_sprint", "Tabata Assault Bike / Rowing Sprint", "quads", 6, "30s sprint", 45, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_vinyasa_flow", "Power Vinyasa Yoga & Balance", "Online", "Yoga · 30 Min",
                "Full-body breath-to-movement yoga routine improving mobility, isometric leg strength, and focus.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("vy_1", "lib_yoga_sun_salutation", "Sun Salutation Vinyasa Flow", "back", 4, "60s flow", 25, 0.0),
                    TemplateExerciseItem("vy_2", "lib_yoga_warrior_flow", "Warrior II & Reverse Warrior", "quads", 4, "45s/side", 25, 0.0),
                    TemplateExerciseItem("vy_3", "lib_yoga_down_dog_cobra", "Downward Dog to Cobra", "hamstrings", 3, "60s", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_yin_recovery", "Evening Yin Yoga & Nervous System Reset", "Online", "Yoga · Recovery",
                "Slow, long-hold floor postures down-regulating sympathetic stress before sleep.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("yn_1", "lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "glutes", 3, "90s/side", 20, 0.0),
                    TemplateExerciseItem("yn_2", "lib_yoga_down_dog_cobra", "Downward Dog to Cobra", "hamstrings", 3, "60s", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_desk_posture", "15-Min Desk & Thoracic Posture Mobility", "Online", "Stretching · Daily",
                "Reverses rounded shoulders, tight hip flexors, and stiff thoracic spine from desk work.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("dp_1", "lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "back", 3, "5/side", 25, 0.0),
                    TemplateExerciseItem("dp_2", "lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "glutes", 2, "60s/side", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_lower_mobility", "Squat & Deadlift Hip/Ankle Mobility", "Online", "Stretching · Lower",
                "Opens hip internal/external rotation, hamstrings, and ankle dorsiflexion before or after leg day.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("lm_1", "lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "back", 3, "6/side", 25, 0.0),
                    TemplateExerciseItem("lm_2", "lib_stretch_pigeon_9090", "90/90 Hip & Pigeon Stretch", "glutes", 3, "60s/side", 20, 0.0),
                    TemplateExerciseItem("lm_3", "lib_leg_press_calves", "Calves on Leg Press", "calves", 3, "15 (stretch)", 45, 60.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_hiit_tabata", "Tabata HIIT Metabolic Conditioning", "Online", "Cardio · 20 Min",
                "High-intensity interval session designed to elevate VO2 max and post-exercise oxygen consumption.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("ht_1", "lib_cardio_jump_rope", "Jump Rope Conditioning", "calves", 4, "60s", 30, 0.0),
                    TemplateExerciseItem("ht_2", "lib_cardio_hiit_sprint", "Tabata Assault Bike / Rowing Sprint", "quads", 8, "20s all-out", 40, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_zone2_base", "Zone 2 Aerobic Recovery & Longevity", "Online", "Cardio · 35 Min",
                "Steady nasal-breathing cardiovascular endurance supporting capillary density and recovery between mesocycles.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("z2_1", "lib_cardio_zone2_incline", "Zone 2 Incline Walk / Bike", "quads", 3, "10 min block", 30, 0.0),
                    TemplateExerciseItem("z2_2", "lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "back", 2, "5/side", 20, 0.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_glute_posterior", "Glute & Posterior Chain Specialization", "Online", "Lower · Specialization",
                "Targeted hip extension, abduction, and lengthened hamstring hypertrophy session.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("gp_1", "lib_glute_bridge", "Barbell Glute Bridge", "glutes", 4, "10–12", 120, 110.0),
                    TemplateExerciseItem("gp_2", "lib_sl_deadlift", "Stiff-Legged Deadlift", "hamstrings", 4, "8–12", 150, 95.0),
                    TemplateExerciseItem("gp_3", "lib_lying_leg_curl", "Lying Leg Curls", "hamstrings", 4, "12–15", 90, 50.0),
                    TemplateExerciseItem("gp_4", "lib_sumo_deficit_dl", "Sumo Deficit Deadlift", "glutes", 3, "8–10", 150, 115.0)
                )), now
            ),
            WorkoutTemplate(
                "tpl_online_core_stability", "Athletic Core & Spinal Flexion Block", "Online", "Core · 20 Min",
                "Focused abdominal hypertrophy and trunk stability pairing weighted flexion with hanging leg raises.",
                serializeTemplateItems(listOf(
                    TemplateExerciseItem("cs_1", "lib_machine_crunch", "Machine Crunches", "abs", 4, "12–20", 60, 45.0),
                    TemplateExerciseItem("cs_2", "lib_hanging_knee_raise", "Hanging Knee Raises", "abs", 4, "12–20", 60, 0.0),
                    TemplateExerciseItem("cs_3", "lib_stretch_worlds_greatest", "World's Greatest Lunge & Thoracic Opener", "back", 2, "5/side", 30, 0.0)
                )), now
            )
        )

        val db = writableDatabase
        var newlyAdded = 0
        db.beginTransaction()
        try {
            for (ex in parsedExercises) {
                if (ex.id !in existingIds) newlyAdded += 1
                upsertLibraryExerciseInternal(db, ex)
            }
            for (tpl in onlineTemplates) {
                upsertTemplateInternal(db, tpl)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }

        val totalAfter = getLibraryExercises().size
        return Triple(totalAfter, newlyAdded, onlineTemplates.size)
    }

    private fun UriEncodeSafe(raw: String): String {
        return try {
            java.net.URLEncoder.encode(raw, "UTF-8")
        } catch (_: Exception) {
            raw.replace(" ", "+")
        }
    }

    fun getActiveDateSet(): Set<String> {
        createV6TablesIfNeeded(writableDatabase)
        val dates = mutableSetOf<String>()
        readableDatabase.rawQuery(
            "SELECT DISTINCT completedDateIso FROM set_logs WHERE completed = 1 AND completedDateIso IS NOT NULL AND completedDateIso != ''",
            null
        ).use { c ->
            while (c.moveToNext()) {
                dates.add(c.getString(0))
            }
        }
        readableDatabase.rawQuery(
            "SELECT DISTINCT dateIso FROM meal_logs WHERE dateIso IS NOT NULL AND dateIso != ''",
            null
        ).use { c ->
            while (c.moveToNext()) {
                dates.add(c.getString(0))
            }
        }
        readableDatabase.rawQuery(
            "SELECT DISTINCT dateIso FROM wellbeing_logs WHERE waterMl > 0 OR breathMinutes > 0 OR mobilityMinutes > 0",
            null
        ).use { c ->
            while (c.moveToNext()) {
                dates.add(c.getString(0))
            }
        }
        return dates
    }

    fun getWidgetProgressSnapshot(activeWeek: Int): WidgetProgressSnapshot {
        val today = LocalDate.now()
        val todayIso = today.toString()
        val activeDates = getActiveDateSet()

        // Compute current consecutive-day streak (up to today, or yesterday if today not yet logged)
        var cursor = if (todayIso in activeDates) today else today.minusDays(1)
        var currentStreak = 0
        while (cursor.toString() in activeDates) {
            currentStreak += 1
            cursor = cursor.minusDays(1)
        }

        // Compute best streak across all recorded dates
        val sortedDates = activeDates.mapNotNull {
            try { LocalDate.parse(it) } catch (_: Exception) { null }
        }.sorted()
        var bestStreak = currentStreak
        var run = 0
        var prev: LocalDate? = null
        for (d in sortedDates) {
            run = if (prev != null && prev.plusDays(1) == d) run + 1 else 1
            if (run > bestStreak) bestStreak = run
            prev = d
        }

        // Last 7 days chronological (6 days ago -> Today)
        val last7 = (6 downTo 0).map { offset ->
            val dt = today.minusDays(offset.toLong())
            val shortLetter = dt.dayOfWeek.getDisplayName(TextStyle.NARROW, Locale.US)
            shortLetter to (dt.toString() in activeDates)
        }

        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
        val allSets = getSetLogs().filter { !(it.templateSessionId?.startsWith("hist_") == true) }
        val weekCompletedLogs = allSets.filter { it.week == activeWeek && it.completed }
        val completedSets = weekCompletedLogs.size
        val dayExercises = getDayExercises()
        val plannedSets = dayExercises.sumOf { it.setsForWeek(activeWeek) }.coerceAtLeast(1)

        fun buildSplitBar(shortTitle: String, fullTitle: String, muscles: Set<String>): WidgetMesoSplitBar {
            val done = weekCompletedLogs.count { it.muscleId in muscles }
            val plan = dayExercises
                .filter { it.muscleId in muscles }
                .sumOf { it.setsForWeek(activeWeek) }
                .coerceAtLeast(1)
            return WidgetMesoSplitBar(
                shortTitle = shortTitle,
                fullTitle = fullTitle,
                completedSets = done,
                plannedSets = plan
            )
        }

        val mesoSplitBars = listOf(
            buildSplitBar("Push", "Upper Push", setOf("chest", "front_delts")),
            buildSplitBar("Back", "Back & Rear", setOf("back", "rear_side_delts", "traps")),
            buildSplitBar("Arms", "Arms (Bi/Tri)", setOf("biceps", "triceps", "forearms")),
            buildSplitBar("Legs", "Legs & Core", setOf("quads", "hamstrings", "glutes", "calves", "abs"))
        )

        val metrics = getDailyMetrics(todayIso)
        val todayMeals = getMealsForDate(todayIso)
        val phaseDelta = when (metrics.phase) {
            "Massing" -> 300; "Mini-Cut" -> -500; else -> 0
        }
        val stepBonus = ((metrics.steps - 6000).coerceAtLeast(0) * 0.035).roundToInt()
        val liftBonus = ((completedSets * 16.5) / 7.0).roundToInt()
        val targetKcal = (metrics.baseTdee + phaseDelta + stepBonus + liftBonus).coerceAtLeast(1250)
        val targetP = (metrics.bodyweightKg * metrics.proteinPerKg).roundToInt().coerceAtLeast(95)

        val eatenKcal = todayMeals.sumOf { it.calories }
        val eatenP = todayMeals.sumOf { it.proteinG }

        return WidgetProgressSnapshot(
            streakDays = currentStreak,
            bestStreakDays = bestStreak,
            last7Days = last7,
            activeWeek = activeWeek,
            weekSubtitle = "Target ${weekMeta.targetRir}",
            completedSets = completedSets,
            plannedSets = plannedSets,
            mesoSplitBars = mesoSplitBars,
            todayCalories = eatenKcal,
            targetCalories = targetKcal,
            todayProteinG = eatenP,
            targetProteinG = targetP
        )
    }

    // Offline JSON Export & Import (Android SAF — Bi-directionally compatible with Web PWA & Standalone APK)
    fun exportFullJsonBackup(): String {
        createV6TablesIfNeeded(writableDatabase)
        val root = JSONObject()
        root.put("schemaVersion", 7)
        root.put("version", "2.7.0")
        root.put("app", "com.hyperlog.rp")
        root.put("exportedAtEpochMs", System.currentTimeMillis())

        val lmArr = JSONArray()
        for (lm in getLandmarks().values) {
            lmArr.put(JSONObject().apply {
                put("id", lm.id); put("name", lm.name); put("shortName", lm.shortName)
                put("majorGroup", lm.majorGroup); put("plane", lm.plane)
                put("mv", lm.mv); put("mev", lm.mev); put("mavMin", lm.mavMin)
                put("mavMax", lm.mavMax); put("mrv", lm.mrv)
                put("freqMin", lm.freqMin); put("freqMax", lm.freqMax)
                put("guidance", lm.guidance)
            })
        }
        root.put("landmarks", lmArr)

        val setsArr = JSONArray()
        for (s in getSetLogs()) {
            setsArr.put(JSONObject().apply {
                put("id", s.id); put("week", s.week); put("dayNumber", s.dayNumber)
                put("templateSessionId", s.templateSessionId ?: JSONObject.NULL)
                put("exerciseId", s.exerciseId); put("exerciseName", s.exerciseName); put("muscleId", s.muscleId)
                put("setIndex", s.setIndex); put("weightKg", s.weightKg); put("reps", s.reps)
                put("rir", s.rir); put("restSeconds", s.restSeconds); put("completed", s.completed)
                put("completedDateIso", s.completedDateIso ?: JSONObject.NULL)
                put("completedDate", s.completedDateIso ?: JSONObject.NULL)
                put("rpe", s.rpe ?: JSONObject.NULL)
            })
        }
        root.put("setLogs", setsArr)

        val notesArr = JSONArray()
        for (n in getWorkoutDayNotesMap().values) {
            notesArr.put(JSONObject().apply {
                put("dateIso", n.dateIso)
                put("title", n.title)
                put("durationMinutes", n.durationMinutes)
                put("notes", n.notes)
            })
        }
        root.put("workoutDayNotes", notesArr)

        val tplArr = JSONArray()
        for (t in getTemplates()) {
            tplArr.put(JSONObject().apply {
                put("id", t.id); put("name", t.name); put("category", t.category)
                put("splitType", t.splitType); put("description", t.description)
                put("exercisesJson", t.exercisesJson); put("updatedAtEpochMs", t.updatedAtEpochMs)
            })
        }
        root.put("templates", tplArr)

        val libArr = JSONArray()
        for (l in getLibraryExercises()) {
            libArr.put(JSONObject().apply {
                put("id", l.id); put("name", l.name); put("majorGroup", l.majorGroup)
                put("primaryMuscle", l.primaryMuscle); put("secondaryMusclesCsv", l.secondaryMusclesCsv)
                put("equipment", l.equipment); put("description", l.description)
                put("instructionsText", l.instructionsText); put("defaultRepRange", l.defaultRepRange)
                put("defaultRestSeconds", l.defaultRestSeconds); put("defaultWeightKg", l.defaultWeightKg)
                put("videoUrl", l.videoUrl)
            })
        }
        root.put("libraryExercises", libArr)

        val mealsArr = JSONArray()
        for (m in getAllMeals()) {
            mealsArr.put(JSONObject().apply {
                put("id", m.id); put("dateIso", m.dateIso); put("mealType", m.mealType)
                put("name", m.name); put("calories", m.calories); put("proteinG", m.proteinG)
                put("carbsG", m.carbsG); put("fatG", m.fatG); put("loggedAtEpochMs", m.loggedAtEpochMs)
            })
        }
        root.put("meals", mealsArr)

        val customMealsArr = JSONArray()
        for (scm in getSavedCustomMeals()) {
            customMealsArr.put(JSONObject().apply {
                put("id", scm.id); put("name", scm.name); put("mealType", scm.mealType)
                put("calories", scm.calories); put("proteinG", scm.proteinG)
                put("carbsG", scm.carbsG); put("fatG", scm.fatG)
                put("ingredientsSummary", scm.ingredientsSummary)
            })
        }
        root.put("savedCustomMeals", customMealsArr)

        val wbArr = JSONArray()
        readableDatabase.rawQuery(
            "SELECT dateIso, waterMl, sleepHours, energyScore, stressScore, sorenessScore, breathMinutes, mobilityMinutes, notes FROM wellbeing_logs",
            null
        ).use { c ->
            while (c.moveToNext()) {
                wbArr.put(JSONObject().apply {
                    put("dateIso", c.getString(0))
                    put("waterMl", c.getInt(1))
                    put("sleepHours", c.getDouble(2))
                    put("energyScore", c.getInt(3))
                    put("stressScore", c.getInt(4))
                    put("sorenessScore", c.getInt(5))
                    put("breathMinutes", c.getInt(6))
                    put("mobilityMinutes", c.getInt(7))
                    put("notes", c.getString(8))
                })
            }
        }
        root.put("wellbeingLogs", wbArr)

        val fbArr = JSONArray()
        for (fb in getUserFeedbackList()) {
            fbArr.put(JSONObject().apply {
                put("id", fb.id)
                put("rating", fb.rating)
                put("category", fb.category)
                put("message", fb.message)
                put("deviceInfo", fb.deviceInfo)
                put("createdAtEpochMs", fb.createdAtEpochMs)
                put("createdAtIso", fb.createdAtIso)
            })
        }
        root.put("userFeedback", fbArr)

        return root.toString(2)
    }

    /** Saves a tester's rating + feedback note into SQLite and returns the saved entry. */
    fun saveUserFeedback(rating: Int, category: String, message: String, deviceInfo: String): UserFeedbackEntry {
        val db = writableDatabase
        createV8TablesIfNeeded(db)
        val nowMs = System.currentTimeMillis()
        val nowIso = Instant.ofEpochMilli(nowMs).toString()
        val entry = UserFeedbackEntry(
            id = "fb_$nowMs",
            rating = rating.coerceIn(1, 5),
            category = category.trim().ifBlank { "General" },
            message = message.trim(),
            deviceInfo = deviceInfo.trim(),
            createdAtEpochMs = nowMs,
            createdAtIso = nowIso
        )
        val cv = ContentValues().apply {
            put("id", entry.id)
            put("rating", entry.rating)
            put("category", entry.category)
            put("message", entry.message)
            put("deviceInfo", entry.deviceInfo)
            put("createdAtEpochMs", entry.createdAtEpochMs)
            put("createdAtIso", entry.createdAtIso)
        }
        db.insertWithOnConflict("user_feedback", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        return entry
    }

    /** Returns all saved user feedback reports newest-first. */
    fun getUserFeedbackList(limit: Int = 25): List<UserFeedbackEntry> {
        val db = readableDatabase
        createV8TablesIfNeeded(writableDatabase)
        val out = mutableListOf<UserFeedbackEntry>()
        db.rawQuery(
            "SELECT id, rating, category, message, deviceInfo, createdAtEpochMs, createdAtIso FROM user_feedback ORDER BY createdAtEpochMs DESC LIMIT ?",
            arrayOf(limit.toString())
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    UserFeedbackEntry(
                        id = c.getString(0),
                        rating = c.getInt(1),
                        category = c.getString(2),
                        message = c.getString(3),
                        deviceInfo = c.getString(4),
                        createdAtEpochMs = c.getLong(5),
                        createdAtIso = c.getString(6)
                    )
                )
            }
        }
        return out
    }

    fun importFullJsonBackup(jsonString: String) {
        val rawParsed = JSONObject(jsonString)
        // Unwrap Web PWA { data: { ... } } envelope if present, or read root directly
        val root = rawParsed.optJSONObject("data") ?: rawParsed
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        createV5TablesIfNeeded(db)
        createV6TablesIfNeeded(db)
        createV8TablesIfNeeded(db)
        createV9TablesIfNeeded(db)
        db.beginTransaction()
        try {
            root.optJSONArray("landmarks")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    upsertLandmarkInternal(db, MuscleLandmark(
                        o.getString("id"), o.getString("name"), o.optString("shortName", o.getString("name")),
                        o.optString("majorGroup", "CHEST"), o.optString("plane", "anterior"),
                        o.optInt("mv", 6), o.optInt("mev", 8), o.optInt("mavMin", 12), o.optInt("mavMax", 18), o.optInt("mrv", 22),
                        o.optDouble("freqMin", 2.0), o.optDouble("freqMax", 4.0), o.optString("guidance", "")
                    ))
                }
            }
            root.optJSONArray("setLogs")?.let { arr ->
                db.delete("set_logs", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val tplId = if (o.isNull("templateSessionId")) null else o.optString("templateSessionId").takeIf { it.isNotBlank() }
                    val rawCompDate = when {
                        !o.isNull("completedDateIso") && o.optString("completedDateIso").isNotBlank() -> o.optString("completedDateIso")
                        !o.isNull("completedDate") && o.optString("completedDate").isNotBlank() -> o.optString("completedDate")
                        else -> null
                    }
                    val rpeVal = if (o.isNull("rpe") || !o.has("rpe")) null else o.optDouble("rpe").takeIf { !it.isNaN() }
                    val isComp = o.optBoolean("completed", false)
                    upsertSetLogInternal(db, SetLog(
                        o.getString("id"), o.optInt("week", 3), o.optInt("dayNumber", 0), tplId,
                        o.optString("exerciseId", "ex_$i"),
                        o.optString("exerciseName", "Exercise"),
                        o.optString("muscleId", "chest"),
                        o.optInt("setIndex", 1), o.optDouble("weightKg", 0.0), o.optInt("reps", 10),
                        o.optDouble("rir", 2.0), o.optInt("restSeconds", 90), isComp,
                        if (isComp) (rawCompDate ?: LocalDate.now().toString()) else null,
                        rpeVal
                    ))
                }
            }
            root.optJSONArray("workoutDayNotes")?.let { arr ->
                db.delete("workout_day_notes", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    saveWorkoutDayNoteInternal(db, WorkoutDayNote(
                        o.getString("dateIso"),
                        o.optString("title", "Workout"),
                        o.optInt("durationMinutes", 55),
                        o.optString("notes", "")
                    ))
                }
            }
            // Also import Web workoutHistory notes if workoutDayNotes absent
            if (!root.has("workoutDayNotes") && root.has("workoutHistory")) {
                root.optJSONArray("workoutHistory")?.let { arr ->
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        val dIso = o.optString("date", "")
                        if (dIso.isNotBlank()) {
                            saveWorkoutDayNoteInternal(db, WorkoutDayNote(
                                dIso,
                                o.optString("title", "Workout"),
                                o.optInt("durationMinutes", 55),
                                o.optString("notes", "")
                            ))
                        }
                    }
                }
            }
            val tplArray = root.optJSONArray("templates") ?: root.optJSONArray("workoutTemplates")
            tplArray?.let { arr ->
                db.delete("workout_templates", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val exJson = if (o.has("exercisesJson")) {
                        o.optString("exercisesJson", "[]")
                    } else {
                        o.optJSONArray("exercises")?.toString() ?: "[]"
                    }
                    upsertTemplateInternal(db, WorkoutTemplate(
                        o.getString("id"), o.getString("name"), o.optString("category", "Custom"),
                        o.optString("splitType", "Custom"), o.optString("description", ""),
                        exJson, o.optLong("updatedAtEpochMs", System.currentTimeMillis())
                    ))
                }
            }
            val libArray = root.optJSONArray("libraryExercises") ?: root.optJSONArray("exerciseLibrary")
            libArray?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val secCsv = if (o.has("secondaryMusclesCsv")) {
                        o.optString("secondaryMusclesCsv", "")
                    } else {
                        val sArr = o.optJSONArray("secondaryMuscles")
                        if (sArr != null) (0 until sArr.length()).joinToString(",") { sArr.optString(it) } else ""
                    }
                    val instTxt = if (o.has("instructionsText")) {
                        o.optString("instructionsText", "")
                    } else {
                        val iArr = o.optJSONArray("instructions")
                        if (iArr != null) (0 until iArr.length()).joinToString("\n") { iArr.optString(it) } else ""
                    }
                    upsertLibraryExerciseInternal(db, LibraryExercise(
                        o.getString("id"), o.getString("name"),
                        o.optString("majorGroup", "CHEST").uppercase(Locale.US),
                        o.optString("primaryMuscle", "chest"),
                        secCsv,
                        o.optString("equipment", "Bodyweight"),
                        o.optString("description", ""),
                        instTxt,
                        o.optString("defaultRepRange", "8–12"),
                        o.optInt("defaultRestSeconds", 90),
                        o.optDouble("defaultWeightKg", 0.0),
                        o.optString("videoUrl", "")
                    ))
                }
            }
            if (root.has("meals")) {
                root.optJSONArray("meals")?.let { arr ->
                    db.delete("meal_logs", null, null)
                    for (i in 0 until arr.length()) {
                        val o = arr.getJSONObject(i)
                        val m = MealLog(
                            o.getString("id"), o.getString("dateIso"), o.optString("mealType", "Meal"),
                            o.getString("name"), o.optInt("calories", 0), o.optInt("proteinG", 0),
                            o.optInt("carbsG", 0), o.optInt("fatG", 0), o.optLong("loggedAtEpochMs", System.currentTimeMillis())
                        )
                        upsertMealInternal(db, m)
                        recordActivityInternal(db, m.dateIso, workout = false, nutrition = true)
                    }
                }
            } else if (root.has("nutritionByDate")) {
                root.optJSONObject("nutritionByDate")?.let { nutObj ->
                    db.delete("meal_logs", null, null)
                    val keys = nutObj.keys()
                    while (keys.hasNext()) {
                        val dIso = keys.next()
                        val dayObj = nutObj.optJSONObject(dIso) ?: continue
                        val mArr = dayObj.optJSONArray("meals") ?: continue
                        for (i in 0 until mArr.length()) {
                            val o = mArr.getJSONObject(i)
                            val m = MealLog(
                                o.optString("id", "meal_${dIso}_$i"),
                                dIso,
                                o.optString("mealType", "Meal"),
                                o.optString("name", "Meal"),
                                o.optInt("calories", 0),
                                o.optInt("proteinG", 0),
                                o.optInt("carbsG", 0),
                                o.optInt("fatG", 0),
                                System.currentTimeMillis()
                            )
                            upsertMealInternal(db, m)
                            recordActivityInternal(db, dIso, workout = false, nutrition = true)
                        }
                    }
                }
            }
            root.optJSONArray("savedCustomMeals")?.let { arr ->
                db.delete("saved_custom_meals", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    upsertSavedCustomMealInternal(db, SavedCustomMeal(
                        o.getString("id"), o.getString("name"), o.optString("mealType", "Meal"),
                        o.optInt("calories", 0), o.optInt("proteinG", 0), o.optInt("carbsG", 0), o.optInt("fatG", 0),
                        o.optString("ingredientsSummary", "")
                    ))
                }
            }
            root.optJSONArray("wellbeingLogs")?.let { arr ->
                db.delete("wellbeing_logs", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val cv = ContentValues().apply {
                        put("dateIso", o.getString("dateIso"))
                        put("waterMl", o.optInt("waterMl", 0))
                        put("sleepHours", o.optDouble("sleepHours", 7.5))
                        put("energyScore", o.optInt("energyScore", 4))
                        put("stressScore", o.optInt("stressScore", 2))
                        put("sorenessScore", o.optInt("sorenessScore", 2))
                        put("breathMinutes", o.optInt("breathMinutes", 0))
                        put("mobilityMinutes", o.optInt("mobilityMinutes", 0))
                        put("notes", o.optString("notes", ""))
                    }
                    db.insertWithOnConflict("wellbeing_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    // =========================================================================
    // SCHEMA v10: DAY-ZERO STRUCTURED TELEMETRY RING BUFFER CRUD
    // =========================================================================
    @Synchronized
    fun insertTelemetryLog(entry: AppTelemetryLogEntry, maxEntries: Int = 500) {
        val db = writableDatabase
        createV10TablesIfNeeded(db)
        val cv = ContentValues().apply {
            put("id", entry.id)
            put("timestampIso", entry.timestampIso)
            put("epochMs", entry.epochMs)
            put("dayZeroOffsetMin", entry.dayZeroOffsetMin)
            put("level", entry.level)
            put("category", entry.category)
            put("event", entry.event)
            if (entry.durationMs != null) put("durationMs", entry.durationMs) else putNull("durationMs")
            put("metadataJson", entry.metadataJson)
        }
        db.insertWithOnConflict("app_event_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
        // Enforce bounded ring buffer so telemetry never bloats SQLite
        db.execSQL(
            """
            DELETE FROM app_event_logs WHERE id NOT IN (
                SELECT id FROM app_event_logs ORDER BY epochMs DESC LIMIT ?
            )
            """.trimIndent(),
            arrayOf(maxEntries)
        )
    }

    fun getTelemetryLogs(limit: Int = 100): List<AppTelemetryLogEntry> {
        val db = writableDatabase
        createV10TablesIfNeeded(db)
        val out = mutableListOf<AppTelemetryLogEntry>()
        db.rawQuery(
            "SELECT id, timestampIso, epochMs, dayZeroOffsetMin, level, category, event, durationMs, metadataJson FROM app_event_logs ORDER BY epochMs DESC LIMIT ?",
            arrayOf(limit.coerceIn(1, 500).toString())
        ).use { c ->
            while (c.moveToNext()) {
                out.add(
                    AppTelemetryLogEntry(
                        id = c.getString(0),
                        timestampIso = c.getString(1),
                        epochMs = c.getLong(2),
                        dayZeroOffsetMin = c.getDouble(3),
                        level = c.getString(4),
                        category = c.getString(5),
                        event = c.getString(6),
                        durationMs = if (c.isNull(7)) null else c.getLong(7),
                        metadataJson = c.getString(8)
                    )
                )
            }
        }
        return out
    }

    fun getTelemetryLogCount(): Int {
        val db = writableDatabase
        createV10TablesIfNeeded(db)
        db.rawQuery("SELECT COUNT(*) FROM app_event_logs", null).use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    @Synchronized
    fun clearTelemetryLogs() {
        val db = writableDatabase
        createV10TablesIfNeeded(db)
        db.delete("app_event_logs", null, null)
    }
}

