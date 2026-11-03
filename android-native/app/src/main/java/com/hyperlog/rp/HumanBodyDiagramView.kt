package com.hyperlog.rp

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.graphics.Typeface
import android.view.MotionEvent
import android.view.View
import kotlin.math.roundToInt

/**
 * One clickable muscle shape on our body map.
 * - [muscleId]: which muscle this shape belongs to (like "chest" or "forearms").
 * - [plane]: "anterior" (front of body) or "posterior" (back of body).
 * - [pts]: list of (x, y) corner points on a simple 100 x 215 grid, just like connect-the-dots!
 */
private data class MuscleRegionPoly(
    val muscleId: String,
    val plane: String,
    val pts: List<Pair<Float, Float>>
)

/**
 * Custom Canvas view that draws the 13-muscle human anatomy map and colors each muscle
 * based on how many sets you finished this week (from gray "rested" up to blue "peak growth").
 * Tapping any muscle highlights it and opens its details!
 */
class HumanBodyDiagramView(
    context: Context,
    private val onMuscleTapped: (String) -> Unit
) : View(context) {

    var planeMode: String = "dual"
        set(value) {
            field = value
            requestLayout()
            invalidate()
        }

    var activeMajorGroup: MajorMuscleGroup = MajorMuscleGroup.ALL
        set(value) { field = value; invalidate() }

    var selectedMuscleId: String = "chest"
        set(value) { field = value; invalidate() }

    var setsByMuscle: Map<String, Int> = emptyMap()
        set(value) { field = value; invalidate() }

    var landmarks: Map<String, MuscleLandmark> = emptyMap()
        set(value) { field = value; invalidate() }

    private val density = context.resources.displayMetrics.density
    private val fillPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    private val glowPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    private val cardBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
    private val cardBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1.2f * density
    }
    private val calloutTitlePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.LEFT
        textSize = 11.5f * density * UiKit.uiScale(context)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }
    private val calloutSubPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.RIGHT
        textSize = 10.5f * density * UiKit.uiScale(context)
        typeface = Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = 10.5f * density * UiKit.uiScale(context)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
    }

    private val polygons: List<MuscleRegionPoly> = buildPolygons()
    private val anteriorPolygons: List<MuscleRegionPoly> = polygons.filter { it.plane == "anterior" }
    private val posteriorPolygons: List<MuscleRegionPoly> = polygons.filter { it.plane == "posterior" }
    private val pathCache = Path()

    private val headerCalloutHeightPx: Float get() = 38f * density

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec).coerceAtLeast((220f * density).roundToInt())
        val minH = (280f * density).roundToInt()
        val maxH = (368f * density).roundToInt()
        val ratio = if (planeMode == "dual") 0.96f else 1.00f
        val desiredH = (w * ratio).roundToInt().coerceIn(minH, maxH)
        setMeasuredDimension(w, desiredH)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 10f || h <= 10f) return

        // 1. Live Selected Muscle MV / MEV / MAV / MRV Callout Header Bar
        drawSelectedMuscleCallout(canvas, w)

        // 2. Anatomical Anterior / Posterior Planes
        val planesTop = headerCalloutHeightPx + 6f * density
        val gap = 8f * density
        when (planeMode) {
            "anterior" -> drawSinglePlane(canvas, RectF(0f, planesTop, w, h), "ANTERIOR · FRONT", "anterior")
            "posterior" -> drawSinglePlane(canvas, RectF(0f, planesTop, w, h), "POSTERIOR · BACK", "posterior")
            else -> {
                val halfW = (w - gap) / 2f
                drawSinglePlane(canvas, RectF(0f, planesTop, halfW, h), "ANTERIOR", "anterior")
                drawSinglePlane(canvas, RectF(halfW + gap, planesTop, w, h), "POSTERIOR", "posterior")
            }
        }
    }

    private fun drawSelectedMuscleCallout(canvas: Canvas, widthPx: Float) {
        val bounds = RectF(0f, 0f, widthPx, headerCalloutHeightPx)
        val r = 12f * density
        cardBgPaint.color = if (UiKit.isPastelGlass) 0xE6FFFFFF.toInt() else UiKit.COL_SUBTLE
        cardBorderPaint.color = UiKit.COL_BORDER
        canvas.drawRoundRect(bounds, r, r, cardBgPaint)
        canvas.drawRoundRect(bounds, r, r, cardBorderPaint)

        val lm = landmarks[selectedMuscleId]
        val sets = setsByMuscle[selectedMuscleId] ?: 0
        val zone = if (lm != null) evaluateVolumeZone(sets, lm) else VolumeZone.BELOW_MV
        val muscleLabel = lm?.shortName ?: selectedMuscleId.replace("_", " ").uppercase()
        val targetInfo = if (lm != null) "$sets sets · MAV ${lm.mavMin}-${lm.mavMax} · MRV ${lm.mrv}" else "$sets sets"

        calloutTitlePaint.color = UiKit.COL_TEXT_DARK
        calloutSubPaint.color = UiKit.COL_ACCENT
        val padX = 10f * density
        canvas.drawText("$muscleLabel · ${zone.shortLabel}", padX, bounds.top + 16f * density, calloutTitlePaint)
        canvas.drawText(targetInfo, widthPx - padX, bounds.top + 16f * density, calloutSubPaint)

        // Segmented MV / MEV / MAV / MRV threshold bar
        val barTop = bounds.top + 23f * density
        val barBot = bounds.top + 30f * density
        val barLeft = padX
        val barRight = widthPx - padX
        val barW = (barRight - barLeft).coerceAtLeast(20f)
        fillPaint.color = if (UiKit.isDark) 0xFF1E293B.toInt() else 0xFFE2E8F0.toInt()
        canvas.drawRoundRect(RectF(barLeft, barTop, barRight, barBot), 4f * density, 4f * density, fillPaint)

        val mrvCap = (lm?.mrv ?: 22).coerceAtLeast(1)
        val frac = (sets.toFloat() / mrvCap.toFloat()).coerceIn(0f, 1f)
        if (frac > 0f) {
            fillPaint.color = zone.strokeColor
            val fillRight = (barLeft + barW * frac).coerceAtLeast(barLeft + 6f * density)
            canvas.drawRoundRect(RectF(barLeft, barTop, fillRight, barBot), 4f * density, 4f * density, fillPaint)
        }
    }

    private fun drawSinglePlane(canvas: Canvas, bounds: RectF, title: String, plane: String) {
        val dark = UiKit.isDark
        cardBgPaint.color = when {
            UiKit.isPastelGlass -> 0xD9F8FAFF.toInt()
            UiKit.isClay && !dark -> 0xFFF3F0FF.toInt()
            else -> UiKit.COL_SUBTLE
        }
        cardBorderPaint.color = UiKit.COL_BORDER
        labelPaint.color = UiKit.COL_TEXT_MUTED

        val r = 15f * density
        canvas.drawRoundRect(bounds, r, r, cardBgPaint)
        canvas.drawRoundRect(bounds, r, r, cardBorderPaint)

        canvas.drawText(title, bounds.centerX(), bounds.top + 16f * density, labelPaint)

        val bodyTop = bounds.top + 22f * density
        val bodyH = bounds.height() - 28f * density
        val bodyW = bounds.width() - 10f * density
        val scale = minOf(bodyW / 100f, bodyH / 215f)
        val ox = bounds.left + (bounds.width() - 100f * scale) / 2f
        val oy = bodyTop + (bodyH - 215f * scale) / 2f

        fun tx(x: Float) = ox + x * scale
        fun ty(y: Float) = oy + y * scale

        // Subtle Studio Halo behind Torso
        fillPaint.color = when {
            dark -> 0x186366F1
            UiKit.isPastelGlass -> 0x2493C5FD
            else -> 0x186366F1
        }
        canvas.drawCircle(tx(50f), ty(92f), 38f * scale, fillPaint)

        // Sculpted Head & Neck Silhouette
        fillPaint.color = if (dark) 0xFF1E293B.toInt() else 0xFFE2E8F0.toInt()
        strokePaint.color = if (dark) 0xFF64748B.toInt() else 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 1.2f * scale
        canvas.drawOval(RectF(tx(40.5f), ty(5.5f), tx(59.5f), ty(27.5f)), fillPaint)
        canvas.drawOval(RectF(tx(40.5f), ty(5.5f), tx(59.5f), ty(27.5f)), strokePaint)
        // Neck column
        canvas.drawRoundRect(RectF(tx(44.5f), ty(26.5f), tx(55.5f), ty(33.5f)), 2.5f * scale, 2.5f * scale, fillPaint)

        //Linea Alba / Spinal Midline Axis
        strokePaint.color = UiKit.COL_BORDER
        strokePaint.strokeWidth = 0.9f * scale
        canvas.drawLine(tx(50f), ty(33f), tx(50f), ty(101f), strokePaint)

        val planePolys = if (plane == "anterior") anteriorPolygons else posteriorPolygons
        for (poly in planePolys) {
            pathCache.reset()
            poly.pts.forEachIndexed { idx, (px, py) ->
                if (idx == 0) pathCache.moveTo(tx(px), ty(py))
                else pathCache.lineTo(tx(px), ty(py))
            }
            pathCache.close()

            val inFilter = activeMajorGroup.matchesMuscle(poly.muscleId)
            val isSelected = selectedMuscleId == poly.muscleId
            val lm = landmarks[poly.muscleId]
            val sets = setsByMuscle[poly.muscleId] ?: 0
            val zone = if (lm != null) evaluateVolumeZone(sets, lm) else VolumeZone.BELOW_MV

            val zoneFill = when {
                zone == VolumeZone.BELOW_MV && dark -> 0xFF334155.toInt()
                zone == VolumeZone.BELOW_MV && UiKit.isPastelGlass -> 0xFFE2E8F0.toInt()
                else -> zone.fillColor
            }
            fillPaint.color = if (inFilter) zoneFill else (if (dark) 0xFF162032.toInt() else 0xFFF1F5F9.toInt())

            if (isSelected) {
                glowPaint.color = if (dark) 0x66818CF8 else 0x554F46E5
                glowPaint.strokeWidth = 4.6f * scale
                canvas.drawPath(pathCache, glowPaint)
            }

            strokePaint.color = when {
                isSelected -> if (dark) 0xFFF8FAFC.toInt() else 0xFF312E81.toInt()
                inFilter -> zone.strokeColor
                else -> UiKit.COL_BORDER
            }
            strokePaint.strokeWidth = when {
                isSelected -> 2.3f * scale
                inFilter && activeMajorGroup != MajorMuscleGroup.ALL -> 1.6f * scale
                else -> 1.0f * scale
            }

            canvas.drawPath(pathCache, fillPaint)
            canvas.drawPath(pathCache, strokePaint)
        }

        // Subtle anatomical muscle separation lines (abdominal intersections / quad sweep)
        strokePaint.color = if (dark) 0x4494A3B8 else 0x44475569
        strokePaint.strokeWidth = 0.8f * scale
        if (plane == "anterior") {
            canvas.drawLine(tx(40f), ty(71f), tx(49f), ty(71f), strokePaint)
            canvas.drawLine(tx(51f), ty(71f), tx(60f), ty(71f), strokePaint)
            canvas.drawLine(tx(40f), ty(81f), tx(49f), ty(81f), strokePaint)
            canvas.drawLine(tx(51f), ty(81f), tx(60f), ty(81f), strokePaint)
            canvas.drawLine(tx(39f), ty(114f), tx(37f), ty(146f), strokePaint)
            canvas.drawLine(tx(61f), ty(114f), tx(63f), ty(146f), strokePaint)
        } else {
            canvas.drawLine(tx(50f), ty(34f), tx(50f), ty(94f), strokePaint)
            canvas.drawLine(tx(39f), ty(125f), tx(39f), ty(152f), strokePaint)
            canvas.drawLine(tx(61f), ty(125f), tx(61f), ty(152f), strokePaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            return true
        }
        if (event.action == MotionEvent.ACTION_UP) {
            val w = width.toFloat()
            val h = height.toFloat()
            val planesTop = headerCalloutHeightPx + 6f * density
            val gap = 8f * density
            val hitMuscle = when (planeMode) {
                "anterior" -> hitTestPlane(event.x, event.y, RectF(0f, planesTop, w, h), "anterior")
                "posterior" -> hitTestPlane(event.x, event.y, RectF(0f, planesTop, w, h), "posterior")
                else -> {
                    val halfW = (w - gap) / 2f
                    if (event.x <= halfW) hitTestPlane(event.x, event.y, RectF(0f, planesTop, halfW, h), "anterior")
                    else hitTestPlane(event.x, event.y, RectF(halfW + gap, planesTop, w, h), "posterior")
                }
            }
            if (hitMuscle != null) {
                performClick()
                onMuscleTapped(hitMuscle)
                return true
            }
        }
        return super.onTouchEvent(event)
    }

    override fun performClick(): Boolean {
        return super.performClick()
    }

    private fun hitTestPlane(tapX: Float, tapY: Float, bounds: RectF, plane: String): String? {
        if (!bounds.contains(tapX, tapY)) return null
        val bodyTop = bounds.top + 22f * density
        val bodyH = bounds.height() - 28f * density
        val bodyW = bounds.width() - 10f * density
        val scale = minOf(bodyW / 100f, bodyH / 215f)
        val ox = bounds.left + (bounds.width() - 100f * scale) / 2f
        val oy = bodyTop + (bodyH - 215f * scale) / 2f
        val nx = (tapX - ox) / scale
        val ny = (tapY - oy) / scale

        val planePolys = if (plane == "anterior") anteriorPolygons else posteriorPolygons
        return planePolys.firstOrNull { pointInPolygon(nx, ny, it.pts) }?.muscleId
    }

    companion object {
        private fun mirrorX(pts: List<Pair<Float, Float>>): List<Pair<Float, Float>> =
            pts.map { (100f - it.first) to it.second }

        private fun pointInPolygon(x: Float, y: Float, poly: List<Pair<Float, Float>>): Boolean {
            var inside = false
            var j = poly.size - 1
            for (i in poly.indices) {
                val xi = poly[i].first
                val yi = poly[i].second
                val xj = poly[j].first
                val yj = poly[j].second
                val denom = (yj - yi).let { if (it == 0f) 0.0001f else it }
                val intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / denom + xi)
                if (intersect) inside = !inside
                j = i
            }
            return inside
        }

        private fun buildPolygons(): List<MuscleRegionPoly> {
            val out = mutableListOf<MuscleRegionPoly>()
            fun sym(id: String, plane: String, pts: List<Pair<Float, Float>>) {
                out.add(MuscleRegionPoly(id, plane, pts))
                out.add(MuscleRegionPoly(id, plane, mirrorX(pts)))
            }
            // Sculpted Anterior (Front) Muscle Silhouettes
            sym("traps", "anterior", listOf(34f to 36f, 44f to 30.5f, 46.5f to 38.5f, 32f to 40.5f))
            sym("front_delts", "anterior", listOf(23.5f to 40.5f, 33.5f to 38.5f, 34.5f to 47f, 31.5f to 53f, 22.5f to 52.5f, 21.5f to 45.5f))
            sym("rear_side_delts", "anterior", listOf(18.5f to 44f, 23.5f to 40.5f, 22f to 53.5f, 17.5f to 54f, 16.8f to 48f))
            sym("chest", "anterior", listOf(33.5f to 40.5f, 49.2f to 40.5f, 49.2f to 59.5f, 41f to 61f, 33f to 57.5f, 32f to 48f))
            sym("biceps", "anterior", listOf(18.5f to 55f, 27.5f to 54.5f, 28.5f to 65f, 26.5f to 76.5f, 18.5f to 76f, 17.5f to 65f))
            sym("forearms", "anterior", listOf(15.5f to 78f, 26f to 78f, 25f to 89f, 22.5f to 104f, 13.5f to 102f, 14f to 88f))
            sym("abs", "anterior", listOf(38.5f to 61.5f, 49.2f to 61.5f, 49.2f to 100f, 40f to 99.5f, 37.5f to 81f))
            sym("quads", "anterior", listOf(31.5f to 102.5f, 48.2f to 102.5f, 48.5f to 128f, 45.8f to 154f, 33.5f to 153f, 29.2f to 126f))
            sym("calves", "anterior", listOf(33f to 158f, 45f to 158f, 46f to 173f, 42.8f to 198f, 34.5f to 198f, 31.5f to 173f))

            // Sculpted Posterior (Back) Muscle Silhouettes
            sym("traps", "posterior", listOf(33.5f to 33f, 49.2f to 29.8f, 49.2f to 56.5f, 41.5f to 49f, 35f to 41f))
            sym("rear_side_delts", "posterior", listOf(19.5f to 41f, 33.5f to 38.5f, 34f to 51.5f, 22f to 53.5f, 17.8f to 47f))
            sym("back", "posterior", listOf(33f to 52f, 42f to 50.5f, 49.2f to 57f, 49.2f to 94.5f, 38.5f to 92f, 34f to 75f, 31.5f to 61f))
            sym("triceps", "posterior", listOf(18.5f to 54.5f, 28.8f to 54f, 29.2f to 66f, 27.5f to 77f, 18.2f to 76f, 17.5f to 65f))
            sym("forearms", "posterior", listOf(15.5f to 78f, 26f to 78f, 25f to 89f, 22.5f to 104f, 13.5f to 102f, 14f to 88f))
            sym("glutes", "posterior", listOf(32.5f to 95.5f, 49.2f to 95.5f, 49.2f to 120f, 38f to 121f, 30.2f to 114f, 30.5f to 103f))
            sym("hamstrings", "posterior", listOf(31.8f to 121.5f, 47.5f to 121.5f, 47.2f to 139f, 45f to 156f, 33.5f to 155f, 31f to 138f))
            sym("calves", "posterior", listOf(32.5f to 159f, 45.8f to 159f, 47f to 174f, 42.8f to 199f, 34.5f to 199f, 31f to 174f))
            return out
        }
    }
}
