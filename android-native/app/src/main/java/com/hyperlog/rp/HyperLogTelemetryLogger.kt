package com.hyperlog.rp

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import kotlin.math.roundToInt

/**
 * Structured Day-Zero Telemetry Log Entry stored in SQLite (`app_event_logs`)
 * and mirrored to `HyperLogData/logs/live_telemetry.jsonl`.
 */
data class AppTelemetryLogEntry(
    val id: String,
    val timestampIso: String,
    val epochMs: Long,
    val dayZeroOffsetMin: Double,
    val level: String,      // "INFO", "METRIC", "ACTION", "WARN", "ERROR"
    val category: String,   // "lifecycle", "navigation", "workout", "nutrition", "ui", "storage", "error"
    val event: String,
    val durationMs: Long?,
    val metadataJson: String
)

data class TelemetryArchiveReceipt(
    val archiveFileName: String,
    val archivedCount: Int,
    val archivedAtIso: String,
    val byteSize: Long
)

/**
 * ============================================================================
 * HyperLogTelemetryLogger.kt — Day-Zero Clean-Slate Telemetry & Log Lifecycle
 *
 * Design Goals:
 * 1. Fresh Day-Zero Baseline: Starts cleanly at T+0.0m for every profile with
 *    zero synthetic or legacy test logs.
 * 2. Bounded Overhead: Retains at most 500 live entries in SQLite (`app_event_logs`)
 *    and streams JSONL asynchronously on a background thread so UI frames stay >=60fps.
 * 3. Archive & Purge Controls: Supports one-tap JSON archive export into
 *    `HyperLogData/logs/archives/` and complete Day-Zero log purging.
 * ============================================================================
 */
object HyperLogTelemetryLogger {

    const val MAX_RING_BUFFER_ENTRIES = 500
    private const val KEY_DAY_ZERO_EPOCH = "day_zero_epoch_ms_v4"

    fun getOrInitDayZeroEpochMs(context: Context): Long {
        val prefs = HyperLogDatabase.getPrefsForActiveUser(context)
        val existing = prefs.getLong(KEY_DAY_ZERO_EPOCH, 0L)
        if (existing > 0L) return existing
        val now = System.currentTimeMillis()
        prefs.edit().putLong(KEY_DAY_ZERO_EPOCH, now).apply()
        return now
    }

    fun resetDayZeroEpochMs(context: Context): Long {
        val now = System.currentTimeMillis()
        HyperLogDatabase.getPrefsForActiveUser(context)
            .edit()
            .putLong(KEY_DAY_ZERO_EPOCH, now)
            .apply()
        return now
    }

    fun logEvent(
        context: Context,
        db: HyperLogDatabase,
        level: String,
        category: String,
        event: String,
        durationMs: Long? = null,
        metadata: Map<String, Any?> = emptyMap()
    ): AppTelemetryLogEntry {
        val nowMs = System.currentTimeMillis()
        val nowIso = Instant.ofEpochMilli(nowMs).toString()
        val dayZeroMs = getOrInitDayZeroEpochMs(context)
        val offsetMin = (((nowMs - dayZeroMs).coerceAtLeast(0L) / 60000.0) * 100.0).roundToInt() / 100.0

        val metaObj = JSONObject()
        metadata.forEach { (k, v) ->
            when (v) {
                null -> metaObj.put(k, JSONObject.NULL)
                is Number, is Boolean, is String -> metaObj.put(k, v)
                else -> metaObj.put(k, v.toString())
            }
        }

        val entry = AppTelemetryLogEntry(
            id = "tlog_${nowMs}_${(1000..9999).random()}",
            timestampIso = nowIso,
            epochMs = nowMs,
            dayZeroOffsetMin = offsetMin,
            level = level.uppercase(),
            category = category,
            event = event,
            durationMs = durationMs,
            metadataJson = metaObj.toString()
        )

        val appCtx = context.applicationContext
        Thread {
            try {
                db.insertTelemetryLog(entry, MAX_RING_BUFFER_ENTRIES)
                appendJsonLineToDisk(appCtx, entry)
                syncSingleEventIfOnline(appCtx, entry)
            } catch (_: Exception) {
                // Telemetry never interrupts foreground user workflows
            }
        }.start()

        return entry
    }

    inline fun <T> measureOperation(
        context: Context,
        db: HyperLogDatabase,
        category: String,
        event: String,
        metadata: Map<String, Any?> = emptyMap(),
        block: () -> T
    ): T {
        val t0 = System.nanoTime()
        return try {
            val res = block()
            val elapsedMs = ((System.nanoTime() - t0) / 1_000_000L).coerceAtLeast(0L)
            logEvent(context, db, "METRIC", category, event, elapsedMs, metadata)
            res
        } catch (err: Exception) {
            val elapsedMs = ((System.nanoTime() - t0) / 1_000_000L).coerceAtLeast(0L)
            logEvent(
                context,
                db,
                "ERROR",
                "error",
                "${event}_failed",
                elapsedMs,
                metadata + ("message" to (err.message ?: "unknown"))
            )
            throw err
        }
    }

    private fun appendJsonLineToDisk(context: Context, entry: AppTelemetryLogEntry) {
        HyperLogStorageManager.ensureDirectories(context)
        val logFile = File(HyperLogStorageManager.logsDir(context), "live_telemetry.jsonl")
        // Rotate JSONL if > 512 KB so disk footprint remains featherlight
        if (logFile.exists() && logFile.length() > 512 * 1024L) {
            val rotated = File(HyperLogStorageManager.logsArchivesDir(context), "auto_rotated_${System.currentTimeMillis()}.jsonl")
            runCatching { logFile.copyTo(rotated, overwrite = true); logFile.writeText("") }
        }
        val lineObj = entryToJsonObject(entry)
        FileOutputStream(logFile, true).use { fos ->
            OutputStreamWriter(fos, Charsets.UTF_8).use { writer ->
                writer.write(lineObj.toString())
                writer.write("\n")
            }
        }
    }

    fun archiveLogsToJson(context: Context, db: HyperLogDatabase): TelemetryArchiveReceipt {
        HyperLogStorageManager.ensureDirectories(context)
        val entries = db.getTelemetryLogs(limit = MAX_RING_BUFFER_ENTRIES)
        val nowIso = Instant.now().toString()
        val safeStamp = nowIso.replace(":", "-").replace(".", "-")
        val archiveFile = File(HyperLogStorageManager.logsArchivesDir(context), "telemetry_archive_$safeStamp.json")

        val arr = JSONArray()
        entries.forEach { arr.put(entryToJsonObject(it)) }
        val payload = JSONObject()
            .put("appVersion", "4.0.0")
            .put("versionCode", 13)
            .put("profileUid", HyperLogDatabase.getActiveAccount(context).uid)
            .put("archivedAtIso", nowIso)
            .put("entryCount", entries.size)
            .put("entries", arr)
            .toString(2)

        archiveFile.writeText(payload, Charsets.UTF_8)
        db.clearTelemetryLogs()
        val liveJsonl = File(HyperLogStorageManager.logsDir(context), "live_telemetry.jsonl")
        if (liveJsonl.exists()) runCatching { liveJsonl.writeText("") }

        logEvent(
            context = context,
            db = db,
            level = "INFO",
            category = "storage",
            event = "telemetry_logs_archived",
            metadata = mapOf("file" to archiveFile.name, "archivedCount" to entries.size)
        )

        return TelemetryArchiveReceipt(
            archiveFileName = archiveFile.name,
            archivedCount = entries.size,
            archivedAtIso = nowIso,
            byteSize = archiveFile.length()
        )
    }

    fun purgeLogsToDayZero(context: Context, db: HyperLogDatabase, deleteArchives: Boolean = false): Int {
        val purgedCount = db.getTelemetryLogCount()
        db.clearTelemetryLogs()
        val liveJsonl = File(HyperLogStorageManager.logsDir(context), "live_telemetry.jsonl")
        if (liveJsonl.exists()) runCatching { liveJsonl.delete() }
        if (deleteArchives) {
            HyperLogStorageManager.logsArchivesDir(context).listFiles()?.forEach { f ->
                runCatching { if (f.isFile) f.delete() }
            }
        }
        resetDayZeroEpochMs(context)
        logEvent(
            context = context,
            db = db,
            level = "INFO",
            category = "lifecycle",
            event = "day_zero_telemetry_purged",
            metadata = mapOf("purgedCount" to purgedCount, "deletedArchives" to deleteArchives)
        )
        return purgedCount
    }

    private fun entryToJsonObject(e: AppTelemetryLogEntry): JSONObject {
        val meta = runCatching { JSONObject(e.metadataJson) }.getOrElse { JSONObject() }
        return JSONObject()
            .put("id", e.id)
            .put("timestampIso", e.timestampIso)
            .put("epochMs", e.epochMs)
            .put("dayZeroOffsetMin", e.dayZeroOffsetMin)
            .put("level", e.level)
            .put("category", e.category)
            .put("event", e.event)
            .apply {
                if (e.durationMs != null) put("durationMs", e.durationMs)
            }
            .put("metadata", meta)
    }

    private fun syncSingleEventIfOnline(context: Context, entry: AppTelemetryLogEntry) {
        val (online, _) = NativeHardwareBridge.getNetworkStatus(context)
        if (!online) return
        var conn: HttpURLConnection? = null
        try {
            val url = URL("https://ais-pre-qzg7nmjamtuqyedml457av-240410553463.asia-southeast1.run.app/api/logs")
            conn = (url.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 4500
                readTimeout = 4500
                doOutput = true
                setRequestProperty("Content-Type", "application/json; charset=utf-8")
            }
            val body = JSONObject()
                .put("source", "android-apk-v4.0.0")
                .put("entries", JSONArray().put(entryToJsonObject(entry)))
                .toString()
            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { it.write(body) }
            conn.responseCode
        } catch (_: Exception) {
            // Local SQLite + JSONL already persisted safely offline
        } finally {
            conn?.disconnect()
        }
    }
}
