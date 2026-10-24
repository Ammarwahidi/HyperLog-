package com.hyperlog.rp

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

class HyperLogDatabase(context: Context) :
    SQLiteOpenHelper(context.applicationContext, "hyperlog_offline_rp.db", null, 3) {

    private val appContext: Context = context.applicationContext

    init {
        setWriteAheadLoggingEnabled(true)
    }

    companion object {
        @Volatile
        private var instance: HyperLogDatabase? = null

        fun getInstance(context: Context): HyperLogDatabase {
            return instance ?: synchronized(this) {
                instance ?: HyperLogDatabase(context.applicationContext).also { instance = it }
            }
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
                completed INTEGER NOT NULL
            )
        """.trimIndent())
        db.execSQL("CREATE INDEX idx_set_logs_wk_day ON set_logs(week, dayNumber, muscleId)")

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

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        if (oldVersion < 3) {
            createV3TablesIfNeeded(db)
            db.beginTransaction()
            try {
                for (scm in SeedCatalog.defaultSavedCustomMeals()) {
                    upsertSavedCustomMealInternal(db, scm)
                }
                val today = LocalDate.now()
                for (offset in 0..3) {
                    val dIso = today.minusDays(offset.toLong()).toString()
                    recordActivityInternal(db, dIso, workout = true, nutrition = true)
                }
                db.setTransactionSuccessful()
            } finally {
                db.endTransaction()
            }
        }
    }

    private fun seedDefaultsIntoDb(db: SQLiteDatabase) {
        db.beginTransaction()
        try {
            for (lm in SeedCatalog.defaultLandmarks()) upsertLandmarkInternal(db, lm)
            for (d in SeedCatalog.defaultWorkoutDays()) upsertWorkoutDayInternal(db, d)
            val exs = SeedCatalog.defaultDayExercises()
            for (ex in exs) upsertDayExerciseInternal(db, ex)
            for (lib in SeedCatalog.defaultLibraryExercises()) upsertLibraryExerciseInternal(db, lib)
            for (tpl in SeedCatalog.defaultStarterTemplates()) upsertTemplateInternal(db, tpl)
            for (sl in SeedCatalog.defaultWeek3BaselineSetLogs(exs)) upsertSetLogInternal(db, sl)
            upsertDailyMetricsInternal(db, SeedCatalog.defaultTodayMetrics())
            for (m in SeedCatalog.defaultTodayMeals()) {
                upsertMealInternal(db, m)
                recordActivityInternal(db, m.dateIso, workout = true, nutrition = true)
            }
            for (scm in SeedCatalog.defaultSavedCustomMeals()) {
                upsertSavedCustomMealInternal(db, scm)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    fun resetToDefaults() {
        val db = writableDatabase
        createV3TablesIfNeeded(db)
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
                "activity_days"
            ).forEach { db.delete(it, null, null) }
            seedDefaultsIntoDb(db)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
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

    private fun upsertSetLogInternal(db: SQLiteDatabase, s: SetLog) {
        val cv = ContentValues().apply {
            put("id", s.id); put("week", s.week); put("dayNumber", s.dayNumber)
            if (s.templateSessionId != null) put("templateSessionId", s.templateSessionId) else putNull("templateSessionId")
            put("exerciseId", s.exerciseId); put("exerciseName", s.exerciseName); put("muscleId", s.muscleId)
            put("setIndex", s.setIndex); put("weightKg", s.weightKg); put("reps", s.reps)
            put("rir", s.rir); put("restSeconds", s.restSeconds); put("completed", if (s.completed) 1 else 0)
        }
        db.insertWithOnConflict("set_logs", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
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
        readableDatabase.rawQuery("SELECT * FROM set_logs ORDER BY week ASC, dayNumber ASC, setIndex ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(SetLog(
                    c.getString(0), c.getInt(1), c.getInt(2),
                    if (c.isNull(3)) null else c.getString(3),
                    c.getString(4), c.getString(5), c.getString(6),
                    c.getInt(7), c.getDouble(8), c.getInt(9), c.getDouble(10), c.getInt(11),
                    c.getInt(12) == 1
                ))
            }
        }
        return out
    }

    fun saveSetLog(s: SetLog, notifyWidget: Boolean = true) {
        val db = writableDatabase
        upsertSetLogInternal(db, s)
        if (s.completed) {
            recordActivityInternal(db, LocalDate.now().toString(), workout = true, nutrition = false)
        }
        if (notifyWidget) {
            HyperLogStreakWidgetProvider.onSetCompleted(appContext)
        }
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
                    val defaultReps = Regex("\\d+").find(ex.repRange)?.value?.toIntOrNull() ?: 10
                    for (s in 1..count) {
                        upsertSetLogInternal(
                            db,
                            SetLog(
                                "w${week}_d${dayNumber}_${ex.id}_s$s", week, dayNumber, null,
                                ex.id, ex.name, ex.muscleId, s, ex.defaultWeightKg, defaultReps,
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
                val repTarget = Regex("\\d+").find(item.reps)?.value?.toIntOrNull() ?: 10
                for (s in 1..item.sets) {
                    upsertSetLogInternal(db, SetLog(
                        "${sessionId}_${item.id}_s$s", activeWeek, 0, sessionId,
                        item.id, item.name, item.primaryMuscle, s, item.defaultWeightKg, repTarget,
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

    fun appendExerciseToScheduleDay(dayNumber: Int, lib: LibraryExercise, activeWeek: Int) {
        val existing = getDayExercises().filter { it.dayNumber == dayNumber }
        val nextOrder = (existing.maxOfOrNull { it.orderIndex } ?: 0) + 1
        val ex = DayExercise(
            "d${dayNumber}_custom_${System.currentTimeMillis()}", dayNumber, nextOrder,
            lib.primaryMuscle, lib.name, false, lib.defaultRepRange, lib.defaultWeightKg, lib.defaultRestSeconds,
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
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun getLibraryExercises(): List<LibraryExercise> {
        val out = mutableListOf<LibraryExercise>()
        readableDatabase.rawQuery("SELECT * FROM library_exercises ORDER BY name ASC", null).use { c ->
            while (c.moveToNext()) {
                out.add(LibraryExercise(
                    c.getString(0), c.getString(1), c.getString(2), c.getString(3), c.getString(4),
                    c.getString(5), c.getString(6), c.getString(7), c.getString(8), c.getInt(9),
                    c.getDouble(10), c.getString(11)
                ))
            }
        }
        return out
    }

    fun saveLibraryExercise(lib: LibraryExercise) = upsertLibraryExerciseInternal(writableDatabase, lib)

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
        return DailyMetrics(dateIso, 82.4, 8000, "Massing", 2650, 2.1)
    }

    fun saveDailyMetrics(dm: DailyMetrics) {
        upsertDailyMetricsInternal(writableDatabase, dm)
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }

    fun getActiveDateSet(): Set<String> {
        val dates = mutableSetOf<String>()
        readableDatabase.rawQuery("SELECT dateIso FROM activity_days WHERE workoutLogged = 1 OR nutritionLogged = 1", null).use { c ->
            while (c.moveToNext()) {
                dates.add(c.getString(0))
            }
        }
        readableDatabase.rawQuery("SELECT DISTINCT dateIso FROM meal_logs", null).use { c ->
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
        val allSets = getSetLogs()
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
            weekSubtitle = "Wk $activeWeek · Target ${weekMeta.targetRir}",
            completedSets = completedSets,
            plannedSets = plannedSets,
            mesoSplitBars = mesoSplitBars,
            todayCalories = eatenKcal,
            targetCalories = targetKcal,
            todayProteinG = eatenP,
            targetProteinG = targetP
        )
    }

    // Offline JSON Export & Import (Android SAF)
    fun exportFullJsonBackup(): String {
        val root = JSONObject()
        root.put("schemaVersion", 3)
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
            })
        }
        root.put("setLogs", setsArr)

        val tplArr = JSONArray()
        for (t in getTemplates()) {
            tplArr.put(JSONObject().apply {
                put("id", t.id); put("name", t.name); put("category", t.category)
                put("splitType", t.splitType); put("description", t.description)
                put("exercisesJson", t.exercisesJson); put("updatedAtEpochMs", t.updatedAtEpochMs)
            })
        }
        root.put("templates", tplArr)

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

        return root.toString(2)
    }

    fun importFullJsonBackup(jsonString: String) {
        val root = JSONObject(jsonString)
        val db = writableDatabase
        createV3TablesIfNeeded(db)
        db.beginTransaction()
        try {
            root.optJSONArray("landmarks")?.let { arr ->
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    upsertLandmarkInternal(db, MuscleLandmark(
                        o.getString("id"), o.getString("name"), o.getString("shortName"),
                        o.optString("majorGroup", "CHEST"), o.optString("plane", "anterior"),
                        o.getInt("mv"), o.getInt("mev"), o.getInt("mavMin"), o.getInt("mavMax"), o.getInt("mrv"),
                        o.optDouble("freqMin", 2.0), o.optDouble("freqMax", 4.0), o.optString("guidance", "")
                    ))
                }
            }
            root.optJSONArray("setLogs")?.let { arr ->
                db.delete("set_logs", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val tplId = if (o.isNull("templateSessionId")) null else o.optString("templateSessionId").takeIf { it.isNotBlank() }
                    upsertSetLogInternal(db, SetLog(
                        o.getString("id"), o.getInt("week"), o.getInt("dayNumber"), tplId,
                        o.getString("exerciseId"), o.getString("exerciseName"), o.getString("muscleId"),
                        o.getInt("setIndex"), o.getDouble("weightKg"), o.getInt("reps"),
                        o.optDouble("rir", 2.0), o.optInt("restSeconds", 90), o.getBoolean("completed")
                    ))
                }
            }
            root.optJSONArray("templates")?.let { arr ->
                db.delete("workout_templates", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    upsertTemplateInternal(db, WorkoutTemplate(
                        o.getString("id"), o.getString("name"), o.getString("category"),
                        o.getString("splitType"), o.getString("description"),
                        o.getString("exercisesJson"), o.optLong("updatedAtEpochMs", System.currentTimeMillis())
                    ))
                }
            }
            root.optJSONArray("meals")?.let { arr ->
                db.delete("meal_logs", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    val m = MealLog(
                        o.getString("id"), o.getString("dateIso"), o.getString("mealType"),
                        o.getString("name"), o.getInt("calories"), o.getInt("proteinG"),
                        o.getInt("carbsG"), o.getInt("fatG"), o.optLong("loggedAtEpochMs", System.currentTimeMillis())
                    )
                    upsertMealInternal(db, m)
                    recordActivityInternal(db, m.dateIso, workout = false, nutrition = true)
                }
            }
            root.optJSONArray("savedCustomMeals")?.let { arr ->
                db.delete("saved_custom_meals", null, null)
                for (i in 0 until arr.length()) {
                    val o = arr.getJSONObject(i)
                    upsertSavedCustomMealInternal(db, SavedCustomMeal(
                        o.getString("id"), o.getString("name"), o.optString("mealType", "Meal"),
                        o.getInt("calories"), o.getInt("proteinG"), o.getInt("carbsG"), o.getInt("fatG"),
                        o.optString("ingredientsSummary", "")
                    ))
                }
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
        HyperLogStreakWidgetProvider.refreshAllWidgets(appContext)
    }
}
