package com.hyperlog.rp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.Locale
import kotlin.math.roundToInt

data class InternalFolderSummary(
    val relativePath: String,
    val fileCount: Int,
    val totalBytes: Long
)

data class StorageAndPackageOverview(
    val rootPath: String,
    val packageVersion: String,
    val installed: Boolean,
    val installedAtIso: String,
    val exerciseCount: Int,
    val videoGuideCount: Int,
    val folders: List<InternalFolderSummary>
)

/**
 * HyperLogStorageManager — Think of this like a neat digital backpack inside your phone!
 *
 * Just like a mobile game unpacks its maps and levels on first launch, this manager creates
 * organized folders inside Android's private internal storage (`filesDir/HyperLogData/`):
 *   - `database/`  -> Automatic JSON backups of your workouts, sets, and body weight
 *   - `training/`  -> Exercise dictionary, workout templates, and guided yoga/cardio flows
 *   - `nutrition/` -> Indian foods & step-by-step macro recipes
 *   - `wellness/`  -> Calming breathing audio soundscape definitions
 *   - `videos/`    -> Form tutorial links sorted into muscle folders (chest, back, arms, etc.)
 *   - `feedback/`  -> Beta tester feedback & bug reports saved safely offline
 */
object HyperLogStorageManager {

    const val PACKAGE_VERSION = "4.0.0"
    private const val REMOTE_BUNDLE_URL =
        "https://ais-pre-qzg7nmjamtuqyedml457av-240410553463.asia-southeast1.run.app/api/package/training-bundle?v=4.0.0"
    private const val PREF_FILE = "hyperlog_pkg_prefs"
    private const val KEY_PKG_VERSION = "installed_pkg_version"
    private const val KEY_PKG_INSTALLED_AT = "installed_pkg_iso"
    private const val KEY_PKG_EX_COUNT = "installed_pkg_exercises"
    private const val KEY_PKG_VID_COUNT = "installed_pkg_videos"

    private val VIDEO_MUSCLE_FOLDERS = listOf(
        "chest",
        "back",
        "shoulders",
        "arms",
        "core",
        "legs",
        "cardio",
        "yoga_mobility"
    )

    fun rootDir(context: Context): File = File(context.filesDir, "HyperLogData")

    fun databaseDir(context: Context): File = File(rootDir(context), "database")

    fun trainingDir(context: Context): File = File(rootDir(context), "training")

    fun nutritionDir(context: Context): File = File(rootDir(context), "nutrition")

    fun wellnessDir(context: Context): File = File(rootDir(context), "wellness")

    fun videosDir(context: Context): File = File(rootDir(context), "videos")

    fun feedbackDir(context: Context): File = File(rootDir(context), "feedback")

    fun logsDir(context: Context): File = File(rootDir(context), "logs")

    fun logsArchivesDir(context: Context): File = File(logsDir(context), "archives")

    /** Creates all internal storage folders if they do not exist yet. */
    fun ensureDirectories(context: Context) {
        databaseDir(context).mkdirs()
        trainingDir(context).mkdirs()
        nutritionDir(context).mkdirs()
        wellnessDir(context).mkdirs()
        videosDir(context).mkdirs()
        feedbackDir(context).mkdirs()
        logsDir(context).mkdirs()
        logsArchivesDir(context).mkdirs()
        VIDEO_MUSCLE_FOLDERS.forEach { folder ->
            File(videosDir(context), folder).mkdirs()
        }
        File(videosDir(context), "offline_saved").mkdirs()
    }

    /**
     * Atomic file write: writes to a temporary `.tmp` file first and then renames it.
     * Why? If the phone battery dies mid-save, the real file is never half-written or corrupted!
     */
    private fun writeTextAtomic(targetFile: File, content: String) {
        targetFile.parentFile?.mkdirs()
        val tmpFile = File(targetFile.parentFile, "${targetFile.name}.tmp")
        tmpFile.writeText(content, Charsets.UTF_8)
        if (!tmpFile.renameTo(targetFile)) {
            tmpFile.copyTo(targetFile, overwrite = true)
            tmpFile.delete()
        }
    }

    fun isPackageVerifiedOnDisk(context: Context): Boolean {
        val requiredFiles = listOf(
            File(trainingDir(context), "training_package_manifest.json"),
            File(trainingDir(context), "exercise_catalog.json"),
            File(trainingDir(context), "workout_templates.json"),
            File(nutritionDir(context), "indian_foods.json"),
            File(nutritionDir(context), "indian_recipes.json"),
            File(wellnessDir(context), "breathing_audio_tracks.json"),
            File(File(videosDir(context), "chest"), "video_guides.json")
        )
        return requiredFiles.all { it.exists() && it.isFile && it.length() > 16L }
    }

    private fun mapMuscleToVideoFolder(majorGroup: String, primaryMuscle: String): String {
        val g = majorGroup.lowercase(Locale.US)
        val m = primaryMuscle.lowercase(Locale.US)
        return when {
            g.contains("cardio") || m.contains("cardio") -> "cardio"
            g.contains("yoga") || g.contains("stretch") || g.contains("mobility") -> "yoga_mobility"
            g.contains("chest") || m.contains("chest") -> "chest"
            g.contains("back") || m.contains("lat") || m.contains("trap") || m.contains("back") -> "back"
            g.contains("shoulder") || m.contains("delt") -> "shoulders"
            g.contains("arm") || m.contains("bicep") || m.contains("tricep") || m.contains("forearm") -> "arms"
            g.contains("core") || m.contains("abs") -> "core"
            g.contains("leg") || g.contains("glute") || m.contains("quad") || m.contains("ham") || m.contains("calf") -> "legs"
            else -> "chest"
        }
    }

    fun saveDatabaseSnapshotAsync(context: Context, db: HyperLogDatabase) {
        val appCtx = context.applicationContext
        Thread {
            try {
                writeDatabaseSnapshotSync(appCtx, db)
            } catch (_: Exception) {
                // Resilient background snapshot
            }
        }.start()
    }

    fun writeDatabaseSnapshotSync(context: Context, db: HyperLogDatabase) {
        ensureDirectories(context)
        val dbFolder = databaseDir(context)
        val activeUid = HyperLogDatabase.getActiveAccount(context).uid
        val suffix = if (activeUid == "guest") "" else "_$activeUid"
        val backupJson = db.exportFullJsonBackup()
        writeTextAtomic(File(dbFolder, "user_database_snapshot$suffix.json"), backupJson)

        val trend = db.getNutritionWeightTrend(14)
        val trendArr = JSONArray()
        trend.forEach { (dateIso, wKg, kcal) ->
            trendArr.put(
                JSONObject()
                    .put("dateIso", dateIso)
                    .put("bodyweightKg", wKg)
                    .put("calories", kcal)
            )
        }
        writeTextAtomic(File(dbFolder, "nutrition_weight_records$suffix.json"), trendArr.toString(2))

        // Also mirror user beta feedback entries to HyperLogData/feedback/tester_feedback.json
        val fbArr = JSONArray()
        db.getUserFeedbackList().forEach { fb ->
            fbArr.put(
                JSONObject()
                    .put("id", fb.id)
                    .put("rating", fb.rating)
                    .put("category", fb.category)
                    .put("message", fb.message)
                    .put("deviceInfo", fb.deviceInfo)
                    .put("createdAtIso", fb.createdAtIso)
            )
        }
        writeTextAtomic(File(feedbackDir(context), "tester_feedback.json"), fbArr.toString(2))
    }

    private fun fetchRemoteBundleJsonOrNull(): JSONObject? {
        val conn = (URL(REMOTE_BUNDLE_URL).openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 8000
            readTimeout = 12000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "HyperLog-Android/$PACKAGE_VERSION")
        }
        return try {
            if (conn.responseCode in 200..299) {
                val raw = BufferedReader(InputStreamReader(conn.inputStream, Charsets.UTF_8)).use { it.readText() }
                JSONObject(raw)
            } else null
        } catch (_: Exception) {
            null
        } finally {
            conn.disconnect()
        }
    }

    private fun unpackAllResourcesSync(
        context: Context,
        db: HyperLogDatabase,
        remoteBundle: JSONObject?
    ): Pair<Int, Int> {
        ensureDirectories(context)
        val exercises = db.getLibraryExercises()
        val templates = db.getTemplates()
        val flows = SeedCatalog.offlineGuidedFlows()
        val indianFoods = SeedCatalog.offlineFoods().filter { it.category == "Indian Foods" }
        val indianRecipes = SeedCatalog.indianRecipes()
        val breathTracks = SeedCatalog.breathingAudioTracks()

        val exArr = JSONArray()
        val groupedVideos = VIDEO_MUSCLE_FOLDERS.associateWith { JSONArray() }
        var videoCount = 0

        exercises.forEach { ex ->
            val videoUrl = ex.videoUrl.ifBlank {
                "https://www.youtube.com/results?search_query=${ex.name.replace(" ", "+")}+proper+form+tutorial"
            }
            videoCount += 1
            exArr.put(
                JSONObject()
                    .put("id", ex.id)
                    .put("name", ex.name)
                    .put("majorGroup", ex.majorGroup)
                    .put("primaryMuscle", ex.primaryMuscle)
                    .put("equipment", ex.equipment)
                    .put("defaultRepRange", ex.defaultRepRange)
                    .put("defaultRestSeconds", ex.defaultRestSeconds)
                    .put("videoUrl", videoUrl)
            )
            val folder = mapMuscleToVideoFolder(ex.majorGroup, ex.primaryMuscle)
            groupedVideos[folder]?.put(
                JSONObject()
                    .put("exerciseId", ex.id)
                    .put("name", ex.name)
                    .put("primaryMuscle", ex.primaryMuscle)
                    .put("equipment", ex.equipment)
                    .put("videoUrl", videoUrl)
                    .put("coachingSteps", JSONArray(ex.instructionSteps()))
            )
        }

        val tDir = trainingDir(context)
        writeTextAtomic(File(tDir, "exercise_catalog.json"), exArr.toString())

        val tplArr = JSONArray()
        templates.forEach { t ->
            tplArr.put(
                JSONObject()
                    .put("id", t.id)
                    .put("name", t.name)
                    .put("category", t.category)
                    .put("splitType", t.splitType)
                    .put("description", t.description)
                    .put("exercisesJson", t.exercisesJson)
            )
        }
        writeTextAtomic(File(tDir, "workout_templates.json"), tplArr.toString(2))

        val flowArr = JSONArray()
        flows.forEach { f ->
            val stepsArr = JSONArray()
            f.steps.forEach { s ->
                stepsArr.put(
                    JSONObject()
                        .put("name", s.name)
                        .put("durationSec", s.durationSec)
                        .put("cue", s.cue)
                )
            }
            flowArr.put(
                JSONObject()
                    .put("id", f.id)
                    .put("title", f.title)
                    .put("modality", f.modality)
                    .put("totalMinutes", f.durationMin)
                    .put("steps", stepsArr)
            )
        }
        writeTextAtomic(File(tDir, "guided_flows.json"), flowArr.toString(2))

        // Unpack Indian Nutrition Foods & Step-by-Step Recipes into HyperLogData/nutrition/
        val nDir = nutritionDir(context)
        val remoteFoods = remoteBundle?.optJSONObject("nutrition")?.optJSONArray("indianFoods")
        val foodsJsonStr = if (remoteFoods != null && remoteFoods.length() > 0) {
            remoteFoods.toString(2)
        } else {
            val fArr = JSONArray()
            indianFoods.forEach { f ->
                fArr.put(
                    JSONObject()
                        .put("id", f.id)
                        .put("name", f.name)
                        .put("category", f.category)
                        .put("baseGrams", f.baseGrams)
                        .put("unitHint", f.unitHint)
                        .put("kcalPerBase", f.kcalPerBase)
                        .put("proteinPerBase", f.proteinPerBase)
                        .put("carbsPerBase", f.carbsPerBase)
                        .put("fatPerBase", f.fatPerBase)
                )
            }
            fArr.toString(2)
        }
        writeTextAtomic(File(nDir, "indian_foods.json"), foodsJsonStr)

        val remoteRecipes = remoteBundle?.optJSONObject("nutrition")?.optJSONArray("indianRecipes")
        val recipesJsonStr = if (remoteRecipes != null && remoteRecipes.length() > 0) {
            remoteRecipes.toString(2)
        } else {
            val rArr = JSONArray()
            indianRecipes.forEach { r ->
                rArr.put(
                    JSONObject()
                        .put("id", r.id)
                        .put("name", r.name)
                        .put("region", r.region)
                        .put("dietaryTag", r.dietaryTag)
                        .put("mealType", r.mealType)
                        .put("prepMinutes", r.prepMinutes)
                        .put("cookMinutes", r.cookMinutes)
                        .put("calories", r.calories)
                        .put("proteinG", r.proteinG)
                        .put("carbsG", r.carbsG)
                        .put("fatG", r.fatG)
                        .put("summary", r.summary)
                        .put("ingredients", JSONArray(r.ingredients))
                        .put("steps", JSONArray(r.steps))
                )
            }
            rArr.toString(2)
        }
        writeTextAtomic(File(nDir, "indian_recipes.json"), recipesJsonStr)

        // Unpack Breathing Audio Tracks Manifest into HyperLogData/wellness/
        val wDir = wellnessDir(context)
        val bArr = JSONArray()
        breathTracks.forEach { tr ->
            bArr.put(
                JSONObject()
                    .put("id", tr.id)
                    .put("title", tr.title)
                    .put("subtitle", tr.subtitle)
                    .put("baseFreqHz", tr.baseFreqHz)
            )
        }
        writeTextAtomic(File(wDir, "breathing_audio_tracks.json"), bArr.toString(2))

        // Write per-muscle workout video guide files in HyperLogData/videos/{folder}/
        val vDir = videosDir(context)
        groupedVideos.forEach { (folder, arr) ->
            val sub = File(vDir, folder).apply { mkdirs() }
            val wrapper = JSONObject()
                .put("folder", folder)
                .put("packageVersion", PACKAGE_VERSION)
                .put("count", arr.length())
                .put("videos", arr)
            writeTextAtomic(File(sub, "video_guides.json"), wrapper.toString())
        }

        val manifestJson = JSONObject()
            .put("packageVersion", PACKAGE_VERSION)
            .put("unpackedAtIso", Instant.now().toString())
            .put("exerciseCount", exercises.size)
            .put("templateCount", templates.size)
            .put("guidedFlowCount", flows.size)
            .put("indianFoodsCount", indianFoods.size)
            .put("indianRecipesCount", indianRecipes.size)
            .put("breathingTrackCount", breathTracks.size)
            .put("videoGuideCount", videoCount)
        writeTextAtomic(File(tDir, "training_package_manifest.json"), manifestJson.toString(2))

        return exercises.size to videoCount
    }

    fun downloadStartupTrainingPackageIfNeeded(
        context: Context,
        db: HyperLogDatabase,
        forceRedownload: Boolean = false,
        onProgress: (percent: Int, label: String) -> Unit,
        onComplete: (StorageAndPackageOverview) -> Unit
    ) {
        val appCtx = context.applicationContext
        val prefs = appCtx.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val installedVer = prefs.getString(KEY_PKG_VERSION, "") ?: ""

        if (!forceRedownload && installedVer == PACKAGE_VERSION && isPackageVerifiedOnDisk(appCtx)) {
            saveDatabaseSnapshotAsync(appCtx, db)
            onComplete(getOverview(appCtx))
            return
        }

        Thread {
            try {
                onProgress(12, "Verifying HyperLogData internal storage folders...")
                ensureDirectories(appCtx)

                var remoteBundle: JSONObject? = null
                val (online, netLabel) = NativeHardwareBridge.getNetworkStatus(appCtx)
                if (online) {
                    onProgress(35, "Downloading v$PACKAGE_VERSION training & nutrition package ($netLabel)...")
                    remoteBundle = fetchRemoteBundleJsonOrNull()
                    try {
                        db.syncOnlineCatalogOverNetwork()
                    } catch (_: Exception) {
                        // Fall back cleanly to embedded seed catalog if network drops mid-flight
                    }
                } else {
                    onProgress(40, "Unpacking embedded offline v$PACKAGE_VERSION resource bundle...")
                }

                onProgress(74, "Unpacking workouts, Indian recipes, breath audio & video guides...")
                val (exCount, vidCount) = unpackAllResourcesSync(appCtx, db, remoteBundle)

                onProgress(92, "Snapshotting SQLite database to HyperLogData/database...")
                writeDatabaseSnapshotSync(appCtx, db)

                val nowIso = Instant.now().toString()
                prefs.edit()
                    .putString(KEY_PKG_VERSION, PACKAGE_VERSION)
                    .putString(KEY_PKG_INSTALLED_AT, nowIso)
                    .putInt(KEY_PKG_EX_COUNT, exCount)
                    .putInt(KEY_PKG_VID_COUNT, vidCount)
                    .apply()

                val overview = getOverview(appCtx)
                onProgress(100, "Package v$PACKAGE_VERSION verified ($exCount exercises)")
                onComplete(overview)
            } catch (_: Exception) {
                try {
                    ensureDirectories(appCtx)
                    val (exCount, vidCount) = unpackAllResourcesSync(appCtx, db, null)
                    writeDatabaseSnapshotSync(appCtx, db)
                    prefs.edit()
                        .putString(KEY_PKG_VERSION, PACKAGE_VERSION)
                        .putString(KEY_PKG_INSTALLED_AT, Instant.now().toString())
                        .putInt(KEY_PKG_EX_COUNT, exCount)
                        .putInt(KEY_PKG_VID_COUNT, vidCount)
                        .apply()
                } catch (_: Exception) {}
                onComplete(getOverview(appCtx))
            }
        }.start()
    }

    private fun computeDirStats(dir: File): Pair<Int, Long> {
        if (!dir.exists()) return 0 to 0L
        var count = 0
        var bytes = 0L
        dir.walkTopDown().forEach { f ->
            if (f.isFile && !f.name.endsWith(".tmp")) {
                count += 1
                bytes += f.length()
            }
        }
        return count to bytes
    }

    fun formatBytes(bytes: Long): String {
        return when {
            bytes >= 1024L * 1024L -> "${((bytes / (1024.0 * 1024.0)) * 10.0).roundToInt() / 10.0} MB"
            bytes >= 1024L -> "${(bytes / 1024.0).roundToInt()} KB"
            else -> "$bytes B"
        }
    }

    fun getOverview(context: Context): StorageAndPackageOverview {
        ensureDirectories(context)
        val prefs = context.getSharedPreferences(PREF_FILE, Context.MODE_PRIVATE)
        val ver = prefs.getString(KEY_PKG_VERSION, PACKAGE_VERSION) ?: PACKAGE_VERSION
        val installedAt = prefs.getString(KEY_PKG_INSTALLED_AT, "") ?: ""
        val exCount = prefs.getInt(KEY_PKG_EX_COUNT, 0).takeIf { it > 0 } ?: SeedCatalog.defaultLibraryExercises().size
        val vidCount = prefs.getInt(KEY_PKG_VID_COUNT, 0).takeIf { it > 0 } ?: exCount

        val (dbFiles, dbBytes) = computeDirStats(databaseDir(context))
        val (trFiles, trBytes) = computeDirStats(trainingDir(context))
        val (nuFiles, nuBytes) = computeDirStats(nutritionDir(context))
        val (wlFiles, wlBytes) = computeDirStats(wellnessDir(context))
        val (vdFiles, vdBytes) = computeDirStats(videosDir(context))
        val (fbFiles, fbBytes) = computeDirStats(feedbackDir(context))
        val (lgFiles, lgBytes) = computeDirStats(logsDir(context))

        val folders = listOf(
            InternalFolderSummary("HyperLogData/database", dbFiles, dbBytes),
            InternalFolderSummary("HyperLogData/training", trFiles, trBytes),
            InternalFolderSummary("HyperLogData/nutrition", nuFiles, nuBytes),
            InternalFolderSummary("HyperLogData/wellness", wlFiles, wlBytes),
            InternalFolderSummary("HyperLogData/videos", vdFiles, vdBytes),
            InternalFolderSummary("HyperLogData/feedback", fbFiles, fbBytes),
            InternalFolderSummary("HyperLogData/logs", lgFiles, lgBytes)
        )
        return StorageAndPackageOverview(
            rootPath = rootDir(context).absolutePath,
            packageVersion = ver,
            installed = installedAt.isNotBlank() && isPackageVerifiedOnDisk(context),
            installedAtIso = installedAt,
            exerciseCount = exCount,
            videoGuideCount = vidCount,
            folders = folders
        )
    }
}
