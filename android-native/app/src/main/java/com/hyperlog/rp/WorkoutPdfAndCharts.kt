package com.hyperlog.rp

import android.app.Activity
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.pdf.PdfDocument
import android.view.View
import android.widget.LinearLayout
import java.io.File
import java.io.FileOutputStream
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Native Android PDF Report Engine using [android.graphics.pdf.PdfDocument].
 * Supports:
 * 1) Single-Day Workout PDF (strictly for the selected Calendar / Tracker date)
 * 2) Complete All-Time Workout History PDF (for Settings -> Export All Data)
 */
object WorkoutPdfExporter {

    private const val PAGE_W = 595 // A4 width in points
    private const val PAGE_H = 842 // A4 height in points
    private const val MARGIN_X = 36f
    private const val CONTENT_W = PAGE_W - MARGIN_X * 2f

    private fun formatHumanDate(iso: String): String {
        return try {
            val dt = LocalDate.parse(iso)
            dt.format(DateTimeFormatter.ofPattern("EEEE, MMM d, yyyy", Locale.US))
        } catch (_: Exception) {
            iso
        }
    }

    private fun formatWeightValue(kg: Double, unit: String): String {
        val raw = if (unit == "lb") kg * 2.20462 else kg
        val rounded = (raw * 10.0).roundToInt() / 10.0
        val clean = if (rounded % 1.0 == 0.0) rounded.toInt().toString() else String.format(Locale.US, "%.1f", rounded)
        return "$clean $unit"
    }

    private fun formatVolumeValue(tonnageKg: Double, unit: String): String {
        val converted = if (unit == "lb") (tonnageKg * 2.20462).roundToInt() else tonnageKg.roundToInt()
        return String.format(Locale.US, "%,d %s", converted, unit)
    }

    fun generateSingleDayPdf(
        context: Context,
        dateIso: String,
        sets: List<SetLog>,
        dayNote: WorkoutDayNote?,
        meals: List<MealLog>,
        landmarks: Map<String, MuscleLandmark>,
        weightUnit: String
    ): File {
        val doc = PdfDocument()
        var pageNum = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
        var canvas = page.canvas
        var y = 40f

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 18f
            color = 0xFFFFFFFF.toInt()
        }
        val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 10.5f
            color = 0xFFCBD5E1.toInt()
        }
        val h2Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 12.5f
            color = 0xFF0F172A.toInt()
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 10f
            color = 0xFF334155.toInt()
        }
        val boldBodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 10f
            color = 0xFF0F172A.toInt()
        }
        val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 9f
            color = 0xFF64748B.toInt()
        }
        val boxFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1f
            color = 0xFFE2E8F0.toInt()
        }

        fun drawFooter(c: Canvas, pNum: Int) {
            c.drawLine(MARGIN_X, PAGE_H - 36f, PAGE_W - MARGIN_X, PAGE_H - 36f, linePaint)
            c.drawText("HyperLog · Single-Day Workout Report ($dateIso)", MARGIN_X, PAGE_H - 20f, mutedPaint)
            val pgTxt = "Page $pNum"
            c.drawText(pgTxt, PAGE_W - MARGIN_X - mutedPaint.measureText(pgTxt), PAGE_H - 20f, mutedPaint)
        }

        fun ensureSpace(needed: Float) {
            if (y + needed > PAGE_H - 52f) {
                drawFooter(canvas, pageNum)
                doc.finishPage(page)
                pageNum += 1
                page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
                canvas = page.canvas
                y = 42f
            }
        }

        // Top Navy Banner
        boxFill.color = 0xFF0F172A.toInt()
        canvas.drawRoundRect(RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 72f), 10f, 10f, boxFill)
        val sessionTitle = dayNote?.title?.takeIf { it.isNotBlank() }
            ?: sets.firstOrNull()?.let { s ->
                if (s.dayNumber > 0) "Week ${s.week} · Day ${s.dayNumber} Workout" else "Workout Session"
            } ?: "Workout Report"
        canvas.drawText("HyperLog · Daily Workout Report", MARGIN_X + 16f, y + 26f, titlePaint)
        val durSuffix = dayNote?.durationMinutes?.takeIf { it > 0 }?.let { " · ${it} min" } ?: ""
        canvas.drawText("${formatHumanDate(dateIso)} · $sessionTitle$durSuffix", MARGIN_X + 16f, y + 46f, subPaint)
        val musclesList = sets.map { landmarks[it.muscleId]?.shortName ?: it.muscleId }.distinct().joinToString(", ")
        if (musclesList.isNotBlank()) {
            canvas.drawText("Muscles: $musclesList", MARGIN_X + 16f, y + 61f, subPaint)
        }
        y += 86f

        // 4 Summary Metrics Strip
        val groupedByExercise = sets.groupBy { it.exerciseName }
        val totalSets = sets.size
        val totalReps = sets.sumOf { it.reps }
        val totalTonnageKg = sets.sumOf { it.weightKg * it.reps }

        val metrics = listOf(
            "EXERCISES" to groupedByExercise.size.toString(),
            "COMPLETED SETS" to totalSets.toString(),
            "TOTAL REPS" to String.format(Locale.US, "%,d", totalReps),
            "VOLUME LOAD" to formatVolumeValue(totalTonnageKg, weightUnit)
        )
        val cardGap = 8f
        val cardW = (CONTENT_W - cardGap * 3f) / 4f
        metrics.forEachIndexed { idx, (lbl, v) ->
            val left = MARGIN_X + idx * (cardW + cardGap)
            val rect = RectF(left, y, left + cardW, y + 46f)
            boxFill.color = 0xFFF8FAFC.toInt()
            canvas.drawRoundRect(rect, 8f, 8f, boxFill)
            canvas.drawRoundRect(rect, 8f, 8f, linePaint)
            canvas.drawText(lbl, left + 10f, y + 17f, mutedPaint)
            canvas.drawText(v, left + 10f, y + 35f, h2Paint)
        }
        y += 60f

        // Optional Session Notes
        if (!dayNote?.notes.isNullOrBlank()) {
            ensureSpace(44f)
            boxFill.color = 0xFFF1F5F9.toInt()
            val noteRect = RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 36f)
            canvas.drawRoundRect(noteRect, 8f, 8f, boxFill)
            canvas.drawText("Session Notes:", MARGIN_X + 12f, y + 15f, boldBodyPaint)
            val trimmedNote = dayNote!!.notes.replace("\n", " ").take(95)
            canvas.drawText(trimmedNote, MARGIN_X + 92f, y + 15f, bodyPaint)
            y += 48f
        }

        // Exercise Breakdown Tables
        groupedByExercise.entries.forEachIndexed { exIdx, (exName, exSets) ->
            val rowHeight = 19f
            val blockHeight = 44f + exSets.size * rowHeight
            ensureSpace(min(blockHeight, 120f))

            val muscleLabel = landmarks[exSets.first().muscleId]?.shortName ?: exSets.first().muscleId
            boxFill.color = 0xFFEFF6FF.toInt()
            canvas.drawRoundRect(RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 24f), 6f, 6f, boxFill)
            canvas.drawText("${exIdx + 1}. $exName ($muscleLabel)", MARGIN_X + 10f, y + 16f, boldBodyPaint)
            val exVol = formatVolumeValue(exSets.sumOf { it.weightKg * it.reps }, weightUnit)
            val rightMeta = "${exSets.size} sets · $exVol"
            canvas.drawText(rightMeta, PAGE_W - MARGIN_X - 10f - mutedPaint.measureText(rightMeta), y + 16f, mutedPaint)
            y += 30f

            // Column headers
            val colSet = MARGIN_X + 10f
            val colLoad = MARGIN_X + 68f
            val colReps = MARGIN_X + 168f
            val colRir = MARGIN_X + 235f
            val colRpe = MARGIN_X + 315f
            val colVol = MARGIN_X + 395f

            canvas.drawText("SET", colSet, y + 10f, mutedPaint)
            canvas.drawText("LOAD", colLoad, y + 10f, mutedPaint)
            canvas.drawText("REPS", colReps, y + 10f, mutedPaint)
            canvas.drawText("RIR", colRir, y + 10f, mutedPaint)
            canvas.drawText("RPE", colRpe, y + 10f, mutedPaint)
            canvas.drawText("VOLUME", colVol, y + 10f, mutedPaint)
            y += 15f
            canvas.drawLine(MARGIN_X, y, PAGE_W - MARGIN_X, y, linePaint)
            y += 4f

            exSets.sortedBy { it.setIndex }.forEachIndexed { sIdx, s ->
                ensureSpace(22f)
                canvas.drawText("#${sIdx + 1}", colSet, y + 13f, boldBodyPaint)
                canvas.drawText(formatWeightValue(s.weightKg, weightUnit), colLoad, y + 13f, bodyPaint)
                canvas.drawText("${s.reps} reps", colReps, y + 13f, bodyPaint)
                canvas.drawText(formatRirShort(s.rir), colRir, y + 13f, bodyPaint)
                val rpeTxt = s.rpe?.let { r ->
                    if (r % 1.0 == 0.0) "RPE ${r.toInt()}" else String.format(Locale.US, "RPE %.1f", r)
                } ?: "—"
                canvas.drawText(rpeTxt, colRpe, y + 13f, bodyPaint)
                canvas.drawText(formatVolumeValue(s.weightKg * s.reps, weightUnit), colVol, y + 13f, bodyPaint)
                y += rowHeight
            }
            y += 10f
        }

        // Same-Day Nutrition Summary (if logged on that date)
        if (meals.isNotEmpty()) {
            ensureSpace(56f)
            val kcal = meals.sumOf { it.calories }
            val p = meals.sumOf { it.proteinG }
            val c = meals.sumOf { it.carbsG }
            val f = meals.sumOf { it.fatG }
            boxFill.color = 0xFFFFF7ED.toInt()
            val nutRect = RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 42f)
            canvas.drawRoundRect(nutRect, 8f, 8f, boxFill)
            canvas.drawText("Same-Day Nutrition ($dateIso)", MARGIN_X + 12f, y + 17f, boldBodyPaint)
            canvas.drawText("$kcal kcal · Protein ${p}g · Carbs ${c}g · Fat ${f}g (${meals.size} meals)", MARGIN_X + 12f, y + 33f, bodyPaint)
            y += 50f
        }

        drawFooter(canvas, pageNum)
        doc.finishPage(page)

        val outFile = File(HyperLogFileProvider.exportDir(context), "hyperlog-workout-$dateIso.pdf")
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        return outFile
    }

    fun generateAllHistoryPdf(
        context: Context,
        setsByDateDesc: Map<String, List<SetLog>>,
        notesMap: Map<String, WorkoutDayNote>,
        landmarks: Map<String, MuscleLandmark>,
        weightUnit: String
    ): File {
        val doc = PdfDocument()
        var pageNum = 1
        var page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
        var canvas = page.canvas
        var y = 40f

        val titlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 18f
            color = 0xFFFFFFFF.toInt()
        }
        val subPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 10.5f
            color = 0xFFCBD5E1.toInt()
        }
        val h2Paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 12f
            color = 0xFF0F172A.toInt()
        }
        val bodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 9.5f
            color = 0xFF334155.toInt()
        }
        val boldBodyPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD)
            textSize = 9.8f
            color = 0xFF0F172A.toInt()
        }
        val mutedPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            typeface = Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL)
            textSize = 8.8f
            color = 0xFF64748B.toInt()
        }
        val boxFill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
        val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 1f
            color = 0xFFE2E8F0.toInt()
        }

        fun drawFooter(c: Canvas, pNum: Int) {
            c.drawLine(MARGIN_X, PAGE_H - 36f, PAGE_W - MARGIN_X, PAGE_H - 36f, linePaint)
            c.drawText("HyperLog · Complete Historical Workout Logbook", MARGIN_X, PAGE_H - 20f, mutedPaint)
            val pgTxt = "Page $pNum"
            c.drawText(pgTxt, PAGE_W - MARGIN_X - mutedPaint.measureText(pgTxt), PAGE_H - 20f, mutedPaint)
        }

        fun ensureSpace(needed: Float) {
            if (y + needed > PAGE_H - 52f) {
                drawFooter(canvas, pageNum)
                doc.finishPage(page)
                pageNum += 1
                page = doc.startPage(PdfDocument.PageInfo.Builder(PAGE_W, PAGE_H, pageNum).create())
                canvas = page.canvas
                y = 42f
            }
        }

        val allSets = setsByDateDesc.values.flatten()
        val totalDays = setsByDateDesc.size
        val totalSets = allSets.size
        val totalReps = allSets.sumOf { it.reps }
        val totalVolKg = allSets.sumOf { it.weightKg * it.reps }

        boxFill.color = 0xFF0F172A.toInt()
        canvas.drawRoundRect(RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 66f), 10f, 10f, boxFill)
        canvas.drawText("HyperLog · Complete Workout History Export", MARGIN_X + 16f, y + 26f, titlePaint)
        canvas.drawText(
            "Exported ${LocalDate.now()} · $totalDays Workout Days · $totalSets Sets · ${formatVolumeValue(totalVolKg, weightUnit)}",
            MARGIN_X + 16f,
            y + 46f,
            subPaint
        )
        y += 80f

        val metrics = listOf(
            "WORKOUT DAYS" to totalDays.toString(),
            "ALL-TIME SETS" to String.format(Locale.US, "%,d", totalSets),
            "ALL-TIME REPS" to String.format(Locale.US, "%,d", totalReps),
            "LIFETIME VOLUME" to formatVolumeValue(totalVolKg, weightUnit)
        )
        val cardGap = 8f
        val cardW = (CONTENT_W - cardGap * 3f) / 4f
        metrics.forEachIndexed { idx, (lbl, v) ->
            val left = MARGIN_X + idx * (cardW + cardGap)
            val rect = RectF(left, y, left + cardW, y + 44f)
            boxFill.color = 0xFFF8FAFC.toInt()
            canvas.drawRoundRect(rect, 8f, 8f, boxFill)
            canvas.drawRoundRect(rect, 8f, 8f, linePaint)
            canvas.drawText(lbl, left + 10f, y + 16f, mutedPaint)
            canvas.drawText(v, left + 10f, y + 34f, h2Paint)
        }
        y += 58f

        setsByDateDesc.entries.forEach { (dateIso, daySets) ->
            ensureSpace(58f)
            val note = notesMap[dateIso]
            val dayTitle = note?.title?.takeIf { it.isNotBlank() }
                ?: daySets.firstOrNull()?.let { s ->
                    if (s.dayNumber > 0) "Week ${s.week} · Day ${s.dayNumber}" else "Logged Workout"
                } ?: "Workout"
            val dayVol = formatVolumeValue(daySets.sumOf { it.weightKg * it.reps }, weightUnit)

            boxFill.color = 0xFFE2E8F0.toInt()
            canvas.drawRoundRect(RectF(MARGIN_X, y, PAGE_W - MARGIN_X, y + 24f), 6f, 6f, boxFill)
            canvas.drawText("${formatHumanDate(dateIso)} · $dayTitle", MARGIN_X + 10f, y + 16f, boldBodyPaint)
            val rightStr = "${daySets.size} sets · $dayVol"
            canvas.drawText(rightStr, PAGE_W - MARGIN_X - 10f - boldBodyPaint.measureText(rightStr), y + 16f, boldBodyPaint)
            y += 30f

            daySets.groupBy { it.exerciseName }.forEach { (exName, exRows) ->
                ensureSpace(20f)
                val muscleName = landmarks[exRows.first().muscleId]?.shortName ?: exRows.first().muscleId
                val setsCompact = exRows.sortedBy { it.setIndex }.joinToString(", ") { s ->
                    val w = formatWeightValue(s.weightKg, weightUnit).substringBefore(" ")
                    val rpePart = s.rpe?.let { r ->
                        if (r % 1.0 == 0.0) " @RPE${r.toInt()}" else String.format(Locale.US, " @RPE%.1f", r)
                    } ?: ""
                    "${w}×${s.reps}$rpePart"
                }
                val line = "• $exName ($muscleName): ${ setsCompact.take(78) }"
                canvas.drawText(line, MARGIN_X + 8f, y + 12f, bodyPaint)
                y += 16f
            }
            if (!note?.notes.isNullOrBlank()) {
                ensureSpace(16f)
                canvas.drawText("  Note: ${note!!.notes.replace("\n", " ").take(85)}", MARGIN_X + 8f, y + 11f, mutedPaint)
                y += 15f
            }
            y += 8f
        }

        drawFooter(canvas, pageNum)
        doc.finishPage(page)

        val outFile = File(
            HyperLogFileProvider.exportDir(context),
            "hyperlog-all-workout-data-${LocalDate.now()}.pdf"
        )
        FileOutputStream(outFile).use { doc.writeTo(it) }
        doc.close()
        return outFile
    }

    fun shareExportFile(
        activity: Activity,
        file: File,
        mimeType: String,
        chooserTitle: String,
        subject: String
    ): Boolean {
        return try {
            val uri = HyperLogFileProvider.uriForExportFile(activity, file)
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = mimeType
                putExtra(Intent.EXTRA_SUBJECT, subject)
                putExtra(Intent.EXTRA_STREAM, uri)
                clipData = ClipData.newRawUri(file.name, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent.createChooser(sendIntent, chooserTitle).apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(chooser)
            true
        } catch (_: Exception) {
            false
        }
    }
}

/**
 * Native Skia Canvas 10-Session Weight Progression Chart for the Exercise Library.
 * Displays Top Load, Avg Load, or Estimated 1RM across the last 10 completed sessions.
 */
class ExerciseProgressionChartView(context: Context) : View(context) {

    var points: List<ExerciseSessionPoint> = emptyList()
        set(value) {
            field = value
            invalidate()
        }

    var metricMode: String = "top" // "top" | "avg" | "e1rm"
        set(value) {
            field = value
            invalidate()
        }

    var weightUnit: String = "kg"
        set(value) {
            field = value
            invalidate()
        }

    private val gridPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f * resources.displayMetrics.density
        pathEffect = DashPathEffect(floatArrayOf(8f, 8f), 0f)
    }

    private val linePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2.6f * resources.displayMetrics.density
        strokeCap = Paint.Cap.ROUND
        strokeJoin = Paint.Join.ROUND
    }

    private val areaPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val dotFillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
    }

    private val dotStrokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 2f * resources.displayMetrics.density
    }

    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.NORMAL)
    }

    init {
        val hPx = UiKit.rdp(context, 185)
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, hPx)
    }

    private fun metricVal(pt: ExerciseSessionPoint): Double {
        val kg = when (metricMode) {
            "avg" -> pt.avgWeightKg
            "e1rm" -> pt.est1RmKg
            else -> pt.topWeightKg
        }
        return if (weightUnit == "lb") kg * 2.20462 else kg
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 10f || h <= 10f) return

        val d = resources.displayMetrics.density
        val strokeCol = if (UiKit.isDark) 0xFF38BDF8.toInt() else 0xFF2563EB.toInt()
        gridPaint.color = UiKit.COL_BORDER
        linePaint.color = strokeCol
        dotFillPaint.color = strokeCol
        dotStrokePaint.color = UiKit.COL_CARD
        labelPaint.color = UiKit.COL_TEXT_MUTED
        labelPaint.textSize = 10f * resources.displayMetrics.scaledDensity

        if (points.isEmpty()) {
            val msg = "Complete sets for this movement in Track to plot your 10-session load curve."
            labelPaint.textAlign = Paint.Align.CENTER
            canvas.drawText(msg, w / 2f, h / 2f, labelPaint)
            return
        }

        val leftPad = 42f * d
        val rightPad = 16f * d
        val topPad = 18f * d
        val bottomPad = 26f * d
        val plotW = max(10f, w - leftPad - rightPad)
        val plotH = max(10f, h - topPad - bottomPad)

        val vals = points.map { metricVal(it) }
        val rawMin = vals.minOrNull() ?: 0.0
        val rawMax = vals.maxOrNull() ?: 100.0
        val span = max(5.0, rawMax - rawMin)
        val yMin = max(0.0, kotlin.math.floor((rawMin - span * 0.2) / 2.5) * 2.5)
        val yMax = kotlin.math.ceil((rawMax + span * 0.2) / 2.5) * 2.5
        val yRange = max(2.5, yMax - yMin)

        // Draw 3 horizontal gridlines + Y labels
        labelPaint.textAlign = Paint.Align.RIGHT
        for (i in 0..2) {
            val frac = i / 2f
            val gy = topPad + plotH * (1f - frac)
            canvas.drawLine(leftPad, gy, leftPad + plotW, gy, gridPaint)
            val v = (yMin + yRange * frac).roundToInt()
            canvas.drawText(v.toString(), leftPad - 6f * d, gy + 3.5f * d, labelPaint)
        }

        val coords = vals.mapIndexed { idx, v ->
            val x = if (vals.size == 1) {
                leftPad + plotW / 2f
            } else {
                leftPad + (idx.toFloat() / (vals.size - 1).toFloat()) * plotW
            }
            val normY = ((v - yMin) / yRange).toFloat().coerceIn(0f, 1f)
            val y = topPad + plotH * (1f - normY)
            x to y
        }

        if (coords.size >= 2) {
            val areaPath = Path().apply {
                moveTo(coords.first().first, topPad + plotH)
                coords.forEach { (cx, cy) -> lineTo(cx, cy) }
                lineTo(coords.last().first, topPad + plotH)
                close()
            }
            areaPaint.shader = LinearGradient(
                0f,
                topPad,
                0f,
                topPad + plotH,
                if (UiKit.isDark) 0x5538BDF8 else 0x442563EB,
                0x042563EB,
                Shader.TileMode.CLAMP
            )
            canvas.drawPath(areaPath, areaPaint)

            val linePath = Path().apply {
                moveTo(coords.first().first, coords.first().second)
                for (i in 1 until coords.size) {
                    lineTo(coords[i].first, coords[i].second)
                }
            }
            canvas.drawPath(linePath, linePaint)
        }

        // Draw data dots + value callouts on first/last/peak + X-axis date ticks
        val peakIdx = vals.indices.maxByOrNull { vals[it] } ?: 0
        coords.forEachIndexed { idx, (cx, cy) ->
            canvas.drawCircle(cx, cy, 4.2f * d, dotFillPaint)
            canvas.drawCircle(cx, cy, 4.2f * d, dotStrokePaint)

            if (idx == 0 || idx == coords.lastIndex || idx == peakIdx) {
                labelPaint.textAlign = when (idx) {
                    0 -> if (coords.size > 1) Paint.Align.LEFT else Paint.Align.CENTER
                    coords.lastIndex -> if (coords.size > 1) Paint.Align.RIGHT else Paint.Align.CENTER
                    else -> Paint.Align.CENTER
                }
                labelPaint.color = UiKit.COL_TEXT_DARK
                val vDisp = ((vals[idx] * 10.0).roundToInt() / 10.0).let {
                    if (it % 1.0 == 0.0) it.toInt().toString() else String.format(Locale.US, "%.1f", it)
                }
                canvas.drawText(vDisp, cx, cy - 7f * d, labelPaint)
            }

            // Sparse X-axis tick labels so labels never collide
            val showTick = coords.size <= 5 || idx == 0 || idx == coords.lastIndex || idx == coords.size / 2
            if (showTick) {
                labelPaint.color = UiKit.COL_TEXT_MUTED
                labelPaint.textAlign = when (idx) {
                    0 -> if (coords.size > 1) Paint.Align.LEFT else Paint.Align.CENTER
                    coords.lastIndex -> if (coords.size > 1) Paint.Align.RIGHT else Paint.Align.CENTER
                    else -> Paint.Align.CENTER
                }
                canvas.drawText(points[idx].shortLabel, cx, h - 6f * d, labelPaint)
            }
        }
    }
}
