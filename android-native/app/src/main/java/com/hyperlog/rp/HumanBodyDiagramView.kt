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

private data class MuscleRegionPoly(
    val muscleId: String,
    val plane: String,
    val pts: List<Pair<Float, Float>>
)

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
    private val strokePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE }
    private val cardBgPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.FILL
        color = 0xFFF8FAFC.toInt()
    }
    private val cardBorderPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = 1f * density
        color = 0xFFE2E8F0.toInt()
    }
    private val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textAlign = Paint.Align.CENTER
        textSize = 10.5f * density * UiKit.uiScale(context)
        typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        color = 0xFF475569.toInt()
    }

    private val polygons: List<MuscleRegionPoly> = buildPolygons()
    private val pathCache = Path()

    override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
        val w = MeasureSpec.getSize(widthMeasureSpec).coerceAtLeast((220f * density).roundToInt())
        val minH = (240f * density).roundToInt()
        val maxH = (325f * density).roundToInt()
        val ratio = if (planeMode == "dual") 0.86f else 0.90f
        val desiredH = (w * ratio).roundToInt().coerceIn(minH, maxH)
        setMeasuredDimension(w, desiredH)
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w <= 10f || h <= 10f) return

        val gap = 8f * density
        when (planeMode) {
            "anterior" -> drawSinglePlane(canvas, RectF(0f, 0f, w, h), "ANTERIOR (FRONT)", "anterior")
            "posterior" -> drawSinglePlane(canvas, RectF(0f, 0f, w, h), "POSTERIOR (BACK)", "posterior")
            else -> {
                val halfW = (w - gap) / 2f
                drawSinglePlane(canvas, RectF(0f, 0f, halfW, h), "ANTERIOR", "anterior")
                drawSinglePlane(canvas, RectF(halfW + gap, 0f, w, h), "POSTERIOR", "posterior")
            }
        }
    }

    private fun drawSinglePlane(canvas: Canvas, bounds: RectF, title: String, plane: String) {
        val dark = UiKit.isDark
        cardBgPaint.color = UiKit.COL_SUBTLE
        cardBorderPaint.color = UiKit.COL_BORDER
        labelPaint.color = UiKit.COL_TEXT_MUTED

        val r = 13f * density
        canvas.drawRoundRect(bounds, r, r, cardBgPaint)
        canvas.drawRoundRect(bounds, r, r, cardBorderPaint)

        canvas.drawText(title, bounds.centerX(), bounds.top + 17f * density, labelPaint)

        val bodyTop = bounds.top + 24f * density
        val bodyH = bounds.height() - 30f * density
        val bodyW = bounds.width() - 10f * density
        val scale = minOf(bodyW / 100f, bodyH / 215f)
        val ox = bounds.left + (bounds.width() - 100f * scale) / 2f
        val oy = bodyTop + (bodyH - 215f * scale) / 2f

        fun tx(x: Float) = ox + x * scale
        fun ty(y: Float) = oy + y * scale

        // Head & Neck Silhouette
        fillPaint.color = if (dark) 0xFF1E293B.toInt() else 0xFFE2E8F0.toInt()
        strokePaint.color = if (dark) 0xFF64748B.toInt() else 0xFF94A3B8.toInt()
        strokePaint.strokeWidth = 1.2f * scale
        canvas.drawCircle(tx(50f), ty(17f), 10.5f * scale, fillPaint)
        canvas.drawCircle(tx(50f), ty(17f), 10.5f * scale, strokePaint)

        // Midline Axis
        strokePaint.color = UiKit.COL_BORDER
        strokePaint.strokeWidth = 1f * scale
        canvas.drawLine(tx(50f), ty(30f), tx(50f), ty(100f), strokePaint)

        val planePolys = polygons.filter { it.plane == plane }
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

            val zoneFill = if (zone == VolumeZone.BELOW_MV && dark) 0xFF334155.toInt() else zone.fillColor
            fillPaint.color = if (inFilter) zoneFill else (if (dark) 0xFF162032.toInt() else 0xFFF1F5F9.toInt())
            strokePaint.color = when {
                isSelected -> if (dark) 0xFFF8FAFC.toInt() else 0xFF0F172A.toInt()
                inFilter -> zone.strokeColor
                else -> UiKit.COL_BORDER
            }
            strokePaint.strokeWidth = when {
                isSelected -> 2.5f * scale
                inFilter && activeMajorGroup != MajorMuscleGroup.ALL -> 1.7f * scale
                else -> 1.0f * scale
            }

            canvas.drawPath(pathCache, fillPaint)
            canvas.drawPath(pathCache, strokePaint)
        }
    }

    override fun onTouchEvent(event: MotionEvent): Boolean {
        if (event.action == MotionEvent.ACTION_DOWN) {
            return true
        }
        if (event.action == MotionEvent.ACTION_UP) {
            val w = width.toFloat()
            val h = height.toFloat()
            val gap = 8f * density
            val hitMuscle = when (planeMode) {
                "anterior" -> hitTestPlane(event.x, event.y, RectF(0f, 0f, w, h), "anterior")
                "posterior" -> hitTestPlane(event.x, event.y, RectF(0f, 0f, w, h), "posterior")
                else -> {
                    val halfW = (w - gap) / 2f
                    if (event.x <= halfW) hitTestPlane(event.x, event.y, RectF(0f, 0f, halfW, h), "anterior")
                    else hitTestPlane(event.x, event.y, RectF(halfW + gap, 0f, w, h), "posterior")
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
        val bodyTop = bounds.top + 24f * density
        val bodyH = bounds.height() - 30f * density
        val bodyW = bounds.width() - 10f * density
        val scale = minOf(bodyW / 100f, bodyH / 215f)
        val ox = bounds.left + (bounds.width() - 100f * scale) / 2f
        val oy = bodyTop + (bodyH - 215f * scale) / 2f
        val nx = (tapX - ox) / scale
        val ny = (tapY - oy) / scale

        return polygons.firstOrNull { it.plane == plane && pointInPolygon(nx, ny, it.pts) }?.muscleId
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
            // Anterior
            sym("traps", "anterior", listOf(35f to 36f, 45f to 31f, 46f to 39f, 32f to 41f))
            sym("front_delts", "anterior", listOf(24f to 41f, 34f to 39f, 35f to 52f, 23f to 53f))
            sym("rear_side_delts", "anterior", listOf(19f to 44f, 24f to 41f, 23f to 55f, 18f to 54f))
            sym("chest", "anterior", listOf(34f to 41f, 49f to 41f, 49f to 61f, 33f to 59f))
            sym("biceps", "anterior", listOf(19f to 55f, 28f to 55f, 27f to 76f, 18f to 76f))
            sym("forearms", "anterior", listOf(15f to 78f, 26f to 78f, 23f to 104f, 13f to 102f))
            sym("abs", "anterior", listOf(38f to 62f, 49f to 62f, 49f to 100f, 39f to 99f))
            sym("quads", "anterior", listOf(31f to 103f, 48f to 103f, 46f to 154f, 31f to 152f))
            sym("calves", "anterior", listOf(32f to 158f, 45f to 158f, 43f to 198f, 34f to 198f))
            // Posterior
            sym("traps", "posterior", listOf(34f to 33f, 49f to 30f, 49f to 56f, 38f to 46f))
            sym("rear_side_delts", "posterior", listOf(20f to 41f, 34f to 39f, 34f to 52f, 19f to 53f))
            sym("back", "posterior", listOf(33f to 52f, 49f to 56f, 49f to 95f, 35f to 84f))
            sym("triceps", "posterior", listOf(19f to 54f, 29f to 54f, 28f to 77f, 18f to 76f))
            sym("forearms", "posterior", listOf(15f to 78f, 26f to 78f, 23f to 104f, 13f to 102f))
            sym("glutes", "posterior", listOf(32f to 96f, 49f to 96f, 49f to 120f, 31f to 118f))
            sym("hamstrings", "posterior", listOf(32f to 121f, 47f to 121f, 45f to 156f, 33f to 155f))
            sym("calves", "posterior", listOf(32f to 159f, 46f to 159f, 43f to 199f, 34f to 199f))
            return out
        }
    }
}
