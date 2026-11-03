package com.hyperlog.rp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.provider.Settings
import android.health.connect.HealthConnectException
import android.health.connect.HealthConnectManager
import android.health.connect.InsertRecordsResponse
import android.health.connect.datatypes.ExerciseSessionRecord
import android.health.connect.datatypes.ExerciseSessionType
import android.health.connect.datatypes.Metadata
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioTrack
import android.media.ToneGenerator
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.OutcomeReceiver
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import kotlin.math.roundToInt

/**
 * Visual color bundle used to highlight set effort (RIR = Reps in Reserve).
 * Green = productive effort (1-3 RIR), Amber = pushing to muscular failure (<1 RIR).
 */
data class RirVisualPalette(
    val bgColor: Int,
    val borderColor: Int,
    val textColor: Int,
    val statusWord: String
)

/** Stores safe pixel padding around camera cutouts (notches) and gesture navigation bars. */
data class SafeScreenInsets(
    val topPx: Int,
    val bottomPx: Int,
    val leftPx: Int,
    val rightPx: Int
)

/**
 * UiKit — Our Simple Lego Block Builder for Android Views!
 *
 * Instead of complicated XML layout files, `UiKit` builds clean cards, buttons, chips,
 * and text views in Kotlin while automatically scaling sizes (`dp` and `sp`) so everything
 * stays easy to read and tap on small phones, big phones, and tablets.
 *
 * Also in this file:
 * - `NativeHardwareBridge`: Controls phone vibration (haptics), timer chimes, screen wake-lock, and Health Connect sync.
 * - `BreathingSoundscapeEngine`: Generates soothing 432Hz/528Hz singing-bowl & ocean sound waves in real time!
 */
object UiKit {
    var themeMode: AppThemeMode = AppThemeMode.CLAYMORPHISM
    var clayHighContrast: Boolean = false
    var clayFlatDepth: Boolean = false

    val isDark: Boolean get() = themeMode.isDark
    val isClay: Boolean get() = themeMode == AppThemeMode.CLAYMORPHISM || themeMode == AppThemeMode.CLAY_DARK
    val isPastelGlass: Boolean get() = themeMode == AppThemeMode.FROST_GLASS

    val COL_BG: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFFF3F1FF.toInt()
            AppThemeMode.CLAY_DARK -> 0xFF121426.toInt()
            AppThemeMode.DAYLIGHT -> 0xFFF8FAFC.toInt()
            AppThemeMode.FROST_GLASS -> 0xFFEEF4FF.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF0B1120.toInt()
            AppThemeMode.AMOLED -> 0xFF000000.toInt()
            AppThemeMode.GRAPHITE -> 0xFF121316.toInt()
        }

    val COL_CARD: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFFFAF9FF.toInt()
            AppThemeMode.CLAY_DARK -> 0xFF1E223E.toInt()
            AppThemeMode.DAYLIGHT -> 0xFFFFFFFF.toInt()
            AppThemeMode.FROST_GLASS -> 0xD9FFFFFF.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF131C2E.toInt()
            AppThemeMode.AMOLED -> 0xFF0D0D12.toInt()
            AppThemeMode.GRAPHITE -> 0xFF1B1D22.toInt()
        }

    val COL_SUBTLE: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFFECEAFA.toInt()
            AppThemeMode.CLAY_DARK -> 0xFF262B4E.toInt()
            AppThemeMode.DAYLIGHT -> 0xFFF1F5F9.toInt()
            AppThemeMode.FROST_GLASS -> 0xC4F1F5FF.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF1A253B.toInt()
            AppThemeMode.AMOLED -> 0xFF16161F.toInt()
            AppThemeMode.GRAPHITE -> 0xFF24272E.toInt()
        }

    val COL_BORDER: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> if (clayHighContrast) 0xFF6366F1.toInt() else 0xFFFFFFFF.toInt()
            AppThemeMode.CLAY_DARK -> if (clayHighContrast) 0xFF818CF8.toInt() else 0xFF394173.toInt()
            AppThemeMode.DAYLIGHT -> 0xFFE2E8F0.toInt()
            AppThemeMode.FROST_GLASS -> 0xEBFFFFFF.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF26334D.toInt()
            AppThemeMode.AMOLED -> 0xFF242432.toInt()
            AppThemeMode.GRAPHITE -> 0xFF30343E.toInt()
        }

    val COL_TEXT_DARK: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFF16182C.toInt()
            AppThemeMode.CLAY_DARK -> 0xFFF6F7FF.toInt()
            AppThemeMode.DAYLIGHT -> 0xFF0F172A.toInt()
            AppThemeMode.FROST_GLASS -> 0xFF0F172A.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFFF1F5F9.toInt()
            AppThemeMode.AMOLED -> 0xFFF8FAFC.toInt()
            AppThemeMode.GRAPHITE -> 0xFFF3F4F6.toInt()
        }

    val COL_TEXT_MID: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFF393E63.toInt()
            AppThemeMode.CLAY_DARK -> 0xFFD0D5F2.toInt()
            AppThemeMode.DAYLIGHT -> 0xFF334155.toInt()
            AppThemeMode.FROST_GLASS -> 0xFF334155.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFFCBD5E1.toInt()
            AppThemeMode.AMOLED -> 0xFFD4D4D8.toInt()
            AppThemeMode.GRAPHITE -> 0xFFD1D5DB.toInt()
        }

    val COL_TEXT_MUTED: Int
        get() = when (themeMode) {
            AppThemeMode.CLAYMORPHISM -> 0xFF565C82.toInt()
            AppThemeMode.CLAY_DARK -> 0xFF9AA2CE.toInt()
            AppThemeMode.DAYLIGHT -> 0xFF64748B.toInt()
            AppThemeMode.FROST_GLASS -> 0xFF475569.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF94A3B8.toInt()
            AppThemeMode.AMOLED -> 0xFFA1A1AA.toInt()
            AppThemeMode.GRAPHITE -> 0xFF9CA3AF.toInt()
        }

    val COL_ACCENT: Int
        get() = when {
            themeMode == AppThemeMode.CLAYMORPHISM -> 0xFF4F46E5.toInt()
            themeMode == AppThemeMode.CLAY_DARK -> 0xFF6366F1.toInt()
            isDark -> 0xFF3B82F6.toInt()
            themeMode == AppThemeMode.FROST_GLASS -> 0xFF4F46E5.toInt()
            else -> 0xFF2563EB.toInt()
        }

    const val COL_FLAME_ORANGE = 0xFFF97316.toInt()

    val COL_CHIP_IDLE: Int
        get() = COL_SUBTLE

    val COL_CHIP_ACTIVE_BG: Int
        get() = when {
            themeMode == AppThemeMode.CLAYMORPHISM -> 0xFF4F46E5.toInt()
            themeMode == AppThemeMode.CLAY_DARK -> 0xFF6366F1.toInt()
            isDark -> 0xFF2563EB.toInt()
            themeMode == AppThemeMode.FROST_GLASS -> 0xFF4F46E5.toInt()
            else -> 0xFF0F172A.toInt()
        }

    const val COL_PURE_WHITE = 0xFFFFFFFF.toInt()

    val COL_ROW_COMPLETED: Int
        get() = if (isDark) 0xFF102A25.toInt() else 0xFFECFDF5.toInt()

    fun dialogTheme(): Int =
        if (isDark) android.R.style.Theme_Material_Dialog_Alert
        else android.R.style.Theme_Material_Light_Dialog_Alert

    // =========================================================================
    // UNIVERSAL ANDROID PHONE SCREEN AUTO-DETECTION & SCALING
    // =========================================================================
    fun screenWidthDp(ctx: Context): Int =
        ctx.resources.configuration.screenWidthDp.takeIf { it > 0 }
            ?: (ctx.resources.displayMetrics.widthPixels / ctx.resources.displayMetrics.density).roundToInt()

    fun screenHeightDp(ctx: Context): Int =
        ctx.resources.configuration.screenHeightDp.takeIf { it > 0 }
            ?: (ctx.resources.displayMetrics.heightPixels / ctx.resources.displayMetrics.density).roundToInt()

    fun isCompactPhone(ctx: Context): Boolean = screenWidthDp(ctx) < 380

    fun uiScale(ctx: Context): Float {
        val sw = screenWidthDp(ctx)
        return when {
            sw < 345 -> 0.90f
            sw < 375 -> 0.95f
            sw >= 430 -> 1.04f
            else -> 1.00f
        }
    }

    fun dp(ctx: Context, v: Int): Int =
        (v * ctx.resources.displayMetrics.density).roundToInt()

    fun rdp(ctx: Context, v: Int): Int =
        (v * uiScale(ctx) * ctx.resources.displayMetrics.density).roundToInt()

    fun rsp(ctx: Context, baseSp: Float): Float =
        baseSp * uiScale(ctx)

    fun fallbackStatusBarHeightPx(ctx: Context): Int {
        val resId = ctx.resources.getIdentifier("status_bar_height", "dimen", "android")
        return if (resId > 0) ctx.resources.getDimensionPixelSize(resId) else dp(ctx, 28)
    }

    fun configureSystemBarsAndInsets(
        activity: Activity,
        rootView: View,
        onInsetsChanged: (SafeScreenInsets) -> Unit
    ) {
        val win = activity.window
        win.statusBarColor = COL_CARD
        win.navigationBarColor = COL_CARD

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.setDecorFitsSystemWindows(false)
            win.insetsController?.let { controller ->
                val lightFlag = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                if (isDark) {
                    controller.setSystemBarsAppearance(0, lightFlag)
                } else {
                    controller.setSystemBarsAppearance(lightFlag, lightFlag)
                }
            }
        } else {
            @Suppress("DEPRECATION")
            var flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            if (!isDark) {
                @Suppress("DEPRECATION")
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    @Suppress("DEPRECATION")
                    flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                }
            }
            @Suppress("DEPRECATION")
            win.decorView.systemUiVisibility = flags
        }

        rootView.setOnApplyWindowInsetsListener { _, insets ->
            val safe = extractSafeInsets(activity, insets)
            onInsetsChanged(safe)
            insets
        }
        rootView.requestApplyInsets()
    }

    fun refreshSystemBarIconLuminance(activity: Activity) {
        val win = activity.window
        win.statusBarColor = COL_CARD
        win.navigationBarColor = COL_CARD
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            win.insetsController?.let { controller ->
                val lightFlag = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
                    WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                if (isDark) {
                    controller.setSystemBarsAppearance(0, lightFlag)
                } else {
                    controller.setSystemBarsAppearance(lightFlag, lightFlag)
                }
            }
        } else {
            @Suppress("DEPRECATION")
            var flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
            if (!isDark) {
                @Suppress("DEPRECATION")
                flags = flags or View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    @Suppress("DEPRECATION")
                    flags = flags or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
                }
            }
            @Suppress("DEPRECATION")
            win.decorView.systemUiVisibility = flags
        }
    }

    private fun extractSafeInsets(ctx: Context, insets: WindowInsets): SafeScreenInsets {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val mask = WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout()
            val bars = insets.getInsets(mask)
            return SafeScreenInsets(
                topPx = bars.top.coerceAtLeast(fallbackStatusBarHeightPx(ctx)),
                bottomPx = bars.bottom,
                leftPx = bars.left,
                rightPx = bars.right
            )
        } else {
            @Suppress("DEPRECATION")
            val top = maxOf(
                insets.systemWindowInsetTop,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) insets.displayCutout?.safeInsetTop ?: 0 else 0,
                fallbackStatusBarHeightPx(ctx)
            )
            @Suppress("DEPRECATION")
            val bottom = insets.systemWindowInsetBottom
            @Suppress("DEPRECATION")
            val left = maxOf(
                insets.systemWindowInsetLeft,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) insets.displayCutout?.safeInsetLeft ?: 0 else 0
            )
            @Suppress("DEPRECATION")
            val right = maxOf(
                insets.systemWindowInsetRight,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) insets.displayCutout?.safeInsetRight ?: 0 else 0
            )
            return SafeScreenInsets(top, bottom, left, right)
        }
    }

    /**
     * Immediate Color-Coded RIR Proximity Feedback:
     * - Green for 1–3 RIR (Optimal hypertrophy proximity)
     * - Yellow for <1 RIR (0 or 0.5 RIR — failure / near-failure)
     * - Neutral Slate for 4+ RIR (Warmup / Deload)
     */
    fun rirPalette(rir: Double): RirVisualPalette {
        return when {
            rir < 1.0 -> RirVisualPalette(
                bgColor = if (isDark) 0xFF422006.toInt() else 0xFFFEF9C3.toInt(),
                borderColor = if (isDark) 0xFFEAB308.toInt() else 0xFFCA8A04.toInt(),
                textColor = if (isDark) 0xFFFDE047.toInt() else 0xFF854D0E.toInt(),
                statusWord = "High Fatigue"
            )
            rir <= 3.0 -> RirVisualPalette(
                bgColor = if (isDark) 0xFF064E3B.toInt() else 0xFFDCFCE7.toInt(),
                borderColor = if (isDark) 0xFF10B981.toInt() else 0xFF16A34A.toInt(),
                textColor = if (isDark) 0xFF6EE7B7.toInt() else 0xFF166534.toInt(),
                statusWord = "Target Zone"
            )
            else -> RirVisualPalette(
                bgColor = COL_SUBTLE,
                borderColor = COL_BORDER,
                textColor = COL_TEXT_MID,
                statusWord = "Deload"
            )
        }
    }

    fun roundedBg(fillColor: Int, radiusDp: Float, ctx: Context, strokeColor: Int = 0, strokeWidthDp: Float = 0f): GradientDrawable {
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radiusDp * ctx.resources.displayMetrics.density
            setColor(fillColor)
            if (strokeWidthDp > 0f) {
                setStroke((strokeWidthDp * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(1), strokeColor)
            }
        }
    }

    /**
     * Zero-delay touchscreen press feedback (scale + opacity micro-transition) so buttons,
     * chips, and nav tabs respond on finger-down before finger-up.
     */
    fun attachInstantPressFeedback(view: View, pressedScale: Float = 0.968f) {
        view.setOnTouchListener { v, ev ->
            when (ev.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate()
                        .scaleX(pressedScale)
                        .scaleY(pressedScale)
                        .alpha(0.90f)
                        .setDuration(75L)
                        .start()
                }
                MotionEvent.ACTION_UP,
                MotionEvent.ACTION_CANCEL -> {
                    v.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .alpha(1f)
                        .setDuration(110L)
                        .start()
                }
            }
            false
        }
    }

    /**
     * 3-Layer Claymorphism Surface Builder:
     * 1. Bottom-right clay bevel cushion (`rimColor`)
     * 2. Smooth top-to-bottom pastel/indigo linear gradient fill (`topColor` -> `bottomColor`)
     * 3. Specular top-left highlight border (`specularStrokeColor`)
     */
    fun claySurfaceDrawable(
        topColor: Int,
        bottomColor: Int,
        rimColor: Int,
        specularStrokeColor: Int,
        radiusDp: Float,
        ctx: Context,
        recessed: Boolean = false
    ): Drawable {
        if (clayFlatDepth) {
            return roundedBg(topColor, radiusDp, ctx, specularStrokeColor, if (clayHighContrast) 2f else 1.3f)
        }
        val radPx = radiusDp * ctx.resources.displayMetrics.density
        val bevelPx = (2.2f * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(2)
        val strokePx = ((if (clayHighContrast) 2.0f else 1.35f) * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(1)

        val baseBevel = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radPx
            setColor(rimColor)
        }
        val plumpBody = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(topColor, bottomColor)
        ).apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = (radPx - bevelPx * 0.35f).coerceAtLeast(4f)
            setStroke(strokePx, specularStrokeColor)
        }
        return LayerDrawable(arrayOf(baseBevel, plumpBody)).apply {
            if (recessed) {
                setLayerInset(1, bevelPx, bevelPx, 0, 0)
            } else {
                setLayerInset(1, 0, 0, bevelPx / 2, bevelPx)
            }
        }
    }

    /**
     * Pastel Glass Root Backdrop:
     * Diagonal soft sky -> lavender -> mint -> rose pastel gradient matching Web `pastel-glass`.
     */
    fun pastelGlassRootDrawable(): Drawable {
        return GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(
                0xFFEAF2FF.toInt(),
                0xFFF3EEFF.toInt(),
                0xFFECFDF5.toInt(),
                0xFFFDF2F8.toInt()
            )
        ).apply {
            shape = GradientDrawable.RECTANGLE
        }
    }

    /**
     * Pastel Glass Frosted Card & Surface Builder:
     * Combines a soft sky-indigo outer prism rim with a luminous translucent white glass sheen
     * and crisp 1.4dp white specular highlight border so Pastel Glass looks airy and consistent everywhere.
     */
    fun pastelGlassSurfaceDrawable(
        ctx: Context,
        radiusDp: Float = 20f,
        accentBorderColor: Int = COL_BORDER,
        subtle: Boolean = false
    ): Drawable {
        val radPx = radiusDp * ctx.resources.displayMetrics.density
        val rimInset = (1.3f * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(1)
        val strokePx = (1.4f * ctx.resources.displayMetrics.density).toInt().coerceAtLeast(1)

        val outerPrism = GradientDrawable(
            GradientDrawable.Orientation.TL_BR,
            intArrayOf(0x88BFDBFE.toInt(), 0x88DDD6FE.toInt(), 0x77FBCFE8.toInt())
        ).apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = radPx
        }

        val topGlass = if (subtle) 0xD9F8FAFF.toInt() else 0xECFFFFFF.toInt()
        val botGlass = if (subtle) 0xBFE8F0FE.toInt() else 0xD1F3F6FF.toInt()
        val innerStroke = if (accentBorderColor != COL_BORDER) accentBorderColor else 0xF5FFFFFF.toInt()

        val frostedPane = GradientDrawable(
            GradientDrawable.Orientation.TOP_BOTTOM,
            intArrayOf(topGlass, botGlass)
        ).apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = (radPx - rimInset * 0.5f).coerceAtLeast(4f)
            setStroke(strokePx, innerStroke)
        }

        return LayerDrawable(arrayOf(outerPrism, frostedPane)).apply {
            setLayerInset(1, 0, 0, rimInset, rimInset)
        }
    }

    fun card(ctx: Context, borderColor: Int = COL_BORDER, borderDp: Float = 1f, padDp: Int = 14): LinearLayout {
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            when {
                isClay -> {
                    val topCol = if (isDark) 0xFF23284A.toInt() else 0xFFFFFFFF.toInt()
                    val botCol = if (isDark) 0xFF191D36.toInt() else 0xFFF4F2FF.toInt()
                    val rimCol = if (isDark) 0xFF0E1020.toInt() else 0xFFD8D4F2.toInt()
                    val specCol = if (borderColor != COL_BORDER) borderColor else COL_BORDER
                    background = claySurfaceDrawable(topCol, botCol, rimCol, specCol, 22f, ctx, recessed = false)
                    elevation = if (clayFlatDepth) dp(ctx, 1).toFloat() else dp(ctx, 5).toFloat()
                }
                isPastelGlass -> {
                    background = pastelGlassSurfaceDrawable(ctx, radiusDp = 20f, accentBorderColor = borderColor, subtle = false)
                    elevation = dp(ctx, 4).toFloat()
                }
                else -> {
                    background = roundedBg(COL_CARD, 14f, ctx, borderColor, borderDp)
                }
            }
            val p = rdp(ctx, if (isClay || isPastelGlass) padDp + 1 else padDp)
            setPadding(p, p, p, p)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = rdp(ctx, 12)
            }
        }
    }

    fun metricBox(ctx: Context, label: String, value: String, valueColor: Int = COL_TEXT_DARK): LinearLayout {
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = when {
                isClay -> {
                    val topCol = if (isDark) 0xFF202544.toInt() else 0xFFE9E7FA.toInt()
                    val botCol = if (isDark) 0xFF282E54.toInt() else 0xFFF6F5FF.toInt()
                    val rimCol = if (isDark) 0xFF121528.toInt() else 0xFFD5D1EE.toInt()
                    claySurfaceDrawable(topCol, botCol, rimCol, COL_BORDER, 14f, ctx, recessed = true)
                }
                isPastelGlass -> pastelGlassSurfaceDrawable(ctx, radiusDp = 14f, subtle = true)
                else -> roundedBg(COL_SUBTLE, 10f, ctx, COL_BORDER, 1f)
            }
            val px = rdp(ctx, 7)
            val py = rdp(ctx, 8)
            setPadding(px, py, px, py)
            addView(text(ctx, label, 9.5f, COL_TEXT_MUTED, bold = true).apply {
                gravity = Gravity.CENTER
                maxLines = 1
            })
            addView(spacerV(ctx, 2))
            addView(text(ctx, value, 12.5f, valueColor, bold = true, tabular = true).apply {
                gravity = Gravity.CENTER
                maxLines = 1
            })
        }
    }

    fun text(
        ctx: Context,
        str: String,
        sizeSp: Float = 13f,
        color: Int = COL_TEXT_DARK,
        bold: Boolean = false,
        tabular: Boolean = false
    ): TextView {
        return TextView(ctx).apply {
            text = str
            textSize = rsp(ctx, sizeSp)
            setTextColor(color)
            if (bold) setTypeface(typeface, Typeface.BOLD)
            if (tabular) fontFeatureSettings = "tnum"
        }
    }

    fun chip(ctx: Context, label: String, active: Boolean, onClick: () -> Unit): TextView {
        return TextView(ctx).apply {
            text = label
            textSize = rsp(ctx, 12f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(if (active) COL_PURE_WHITE else COL_TEXT_MID)
            background = when {
                isClay -> {
                    if (active) {
                        claySurfaceDrawable(0xFF6366F1.toInt(), 0xFF4338CA.toInt(), 0xFF312E81.toInt(), 0xFFA5B4FC.toInt(), 14f, ctx)
                    } else {
                        val topC = if (isDark) 0xFF282E54.toInt() else 0xFFFFFFFF.toInt()
                        val botC = if (isDark) 0xFF1F2442.toInt() else 0xFFECEAFA.toInt()
                        val rimC = if (isDark) 0xFF111428.toInt() else 0xFFD4D0EE.toInt()
                        claySurfaceDrawable(topC, botC, rimC, COL_BORDER, 14f, ctx)
                    }
                }
                isPastelGlass -> {
                    if (active) {
                        claySurfaceDrawable(0xFF6366F1.toInt(), 0xFF4F46E5.toInt(), 0xFF3730A3.toInt(), 0xFFC7D2FE.toInt(), 13f, ctx)
                    } else {
                        pastelGlassSurfaceDrawable(ctx, radiusDp = 13f, subtle = true)
                    }
                }
                else -> {
                    roundedBg(
                        fillColor = if (active) COL_CHIP_ACTIVE_BG else COL_CHIP_IDLE,
                        radiusDp = 10f,
                        ctx = ctx,
                        strokeColor = if (active) COL_CHIP_ACTIVE_BG else COL_BORDER,
                        strokeWidthDp = 1f
                    )
                }
            }
            minHeight = dp(ctx, 40)
            val px = rdp(ctx, 13)
            val py = rdp(ctx, 8)
            setPadding(px, py, px, py)
            gravity = Gravity.CENTER
            isSingleLine = true
            attachInstantPressFeedback(this, 0.96f)
            setOnClickListener { onClick() }
        }
    }

    fun rirDropdownSpinner(ctx: Context, currentRir: Double, onSelected: (Double) -> Unit): Spinner {
        val labels = RIR_OPTIONS.map { "${formatRirShort(it)} ▾" }
        val dropdownLabels = listOf(
            "0 RIR · Failure (<1 Yellow)",
            "0.5 RIR · Near Fail (<1 Yellow)",
            "1 RIR · Optimal (1–3 Green)",
            "2 RIR · Optimal (1–3 Green)",
            "3 RIR · Optimal (1–3 Green)",
            "4+ RIR · Warmup / Deload"
        )
        val initialIdx = RIR_OPTIONS.indexOfFirst { kotlin.math.abs(it - currentRir) < 0.05 }.let { if (it >= 0) it else 2 }
        val pal = rirPalette(currentRir)

        return Spinner(ctx, Spinner.MODE_DROPDOWN).apply {
            background = roundedBg(pal.bgColor, 9f, ctx, pal.borderColor, 1.4f)
            minimumHeight = dp(ctx, 40)
            val adapter = object : ArrayAdapter<String>(ctx, android.R.layout.simple_spinner_item, labels) {
                override fun getView(position: Int, convertView: View?, parent: ViewGroup): View {
                    val optRir = RIR_OPTIONS.getOrElse(position) { currentRir }
                    val p = rirPalette(optRir)
                    return TextView(ctx).apply {
                        text = labels[position]
                        textSize = rsp(ctx, 11.5f)
                        setTypeface(typeface, Typeface.BOLD)
                        fontFeatureSettings = "tnum"
                        setTextColor(p.textColor)
                        gravity = Gravity.CENTER
                        isSingleLine = true
                        val px = rdp(ctx, 6)
                        val py = rdp(ctx, 7)
                        setPadding(px, py, px, py)
                    }
                }

                override fun getDropDownView(position: Int, convertView: View?, parent: ViewGroup): View {
                    val optRir = RIR_OPTIONS.getOrElse(position) { 2.0 }
                    val p = rirPalette(optRir)
                    return TextView(ctx).apply {
                        text = dropdownLabels[position]
                        textSize = rsp(ctx, 13f)
                        setTypeface(typeface, Typeface.BOLD)
                        setTextColor(p.textColor)
                        setBackgroundColor(p.bgColor)
                        val px = dp(ctx, 14)
                        val py = dp(ctx, 11)
                        setPadding(px, py, px, py)
                    }
                }
            }
            this.adapter = adapter
            setSelection(initialIdx, false)
            onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                    val chosen = RIR_OPTIONS.getOrElse(position) { currentRir }
                    val newPal = rirPalette(chosen)
                    this@apply.background = roundedBg(newPal.bgColor, 9f, ctx, newPal.borderColor, 1.4f)
                    if (kotlin.math.abs(chosen - currentRir) >= 0.05) {
                        onSelected(chosen)
                    }
                }
                override fun onNothingSelected(parent: AdapterView<*>?) {}
            }
        }
    }

    /**
     * Edge-safe horizontal chip scroller with clipToPadding=false and trailing breathing room
     * so chips never clip harshly on narrow or curved-edge Android screens.
     */
    fun hScrollRow(ctx: Context): Pair<HorizontalScrollView, LinearLayout> {
        val row = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, dp(ctx, 8), 0)
        }
        val hsv = HorizontalScrollView(ctx).apply {
            isHorizontalScrollBarEnabled = false
            clipToPadding = false
            overScrollMode = View.OVER_SCROLL_NEVER
            addView(row)
        }
        return hsv to row
    }

    fun primaryButton(ctx: Context, label: String, bgColor: Int = COL_CHIP_ACTIVE_BG, onClick: () -> Unit): TextView {
        return TextView(ctx).apply {
            text = label
            textSize = rsp(ctx, 13f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(COL_PURE_WHITE)
            gravity = Gravity.CENTER
            minHeight = dp(ctx, 46)
            val px = rdp(ctx, 15)
            val py = rdp(ctx, 11)
            setPadding(px, py, px, py)
            background = if (isClay) {
                val (topC, botC, rimC, specC) = when (bgColor) {
                    0xFF10B981.toInt(), 0xFF059669.toInt() -> arrayOf(0xFF34D399.toInt(), 0xFF059669.toInt(), 0xFF065F46.toInt(), 0xFFA7F3D0.toInt())
                    0xFFF97316.toInt(), 0xFFEA580C.toInt() -> arrayOf(0xFFFB923C.toInt(), 0xFFEA580C.toInt(), 0xFF9A3412.toInt(), 0xFFFED7AA.toInt())
                    else -> arrayOf(0xFF6366F1.toInt(), 0xFF4338CA.toInt(), 0xFF312E81.toInt(), 0xFFC7D2FE.toInt())
                }
                claySurfaceDrawable(topC, botC, rimC, specC, 15f, ctx)
            } else {
                roundedBg(bgColor, 11f, ctx)
            }
            if (isClay && !clayFlatDepth) elevation = dp(ctx, 3).toFloat()
            attachInstantPressFeedback(this, 0.97f)
            setOnClickListener { onClick() }
        }
    }

    fun outlineButton(ctx: Context, label: String, textColor: Int = COL_TEXT_DARK, onClick: () -> Unit): TextView {
        return TextView(ctx).apply {
            text = label
            textSize = rsp(ctx, 12f)
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(textColor)
            gravity = Gravity.CENTER
            minHeight = dp(ctx, 44)
            val px = rdp(ctx, 13)
            val py = rdp(ctx, 9)
            setPadding(px, py, px, py)
            background = when {
                isClay -> {
                    val topC = if (isDark) 0xFF252B50.toInt() else 0xFFFFFFFF.toInt()
                    val botC = if (isDark) 0xFF1C203C.toInt() else 0xFFEEEBFC.toInt()
                    val rimC = if (isDark) 0xFF0F1224.toInt() else 0xFFD4D0EE.toInt()
                    claySurfaceDrawable(topC, botC, rimC, COL_BORDER, 14f, ctx)
                }
                isPastelGlass -> pastelGlassSurfaceDrawable(ctx, radiusDp = 13f, subtle = false)
                else -> roundedBg(COL_CARD, 10f, ctx, COL_BORDER, 1f)
            }
            attachInstantPressFeedback(this, 0.97f)
            setOnClickListener { onClick() }
        }
    }

    fun progressBar(ctx: Context, fraction: Float, fillColor: Int): View {
        val outer = FrameLayout(ctx).apply {
            background = roundedBg(COL_CHIP_IDLE, if (isClay || isPastelGlass) 7f else 5f, ctx)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(ctx, if (isClay || isPastelGlass) 10 else 9)
            ).apply {
                topMargin = dp(ctx, 5)
                bottomMargin = dp(ctx, 5)
            }
        }
        val clamped = fraction.coerceIn(0f, 1f)
        if (clamped > 0f) {
            outer.post {
                val fillW = (outer.width * clamped).toInt().coerceAtLeast(dp(ctx, 4))
                val inner = View(ctx).apply {
                    background = roundedBg(fillColor, if (isClay || isPastelGlass) 7f else 5f, ctx)
                    layoutParams = FrameLayout.LayoutParams(fillW, FrameLayout.LayoutParams.MATCH_PARENT)
                }
                outer.removeAllViews()
                outer.addView(inner)
            }
        }
        return outer
    }

    fun inputBox(ctx: Context, initialText: String, hintStr: String, inputTypeFlags: Int): EditText {
        return EditText(ctx).apply {
            setText(initialText)
            hint = hintStr
            textSize = rsp(ctx, 13f)
            setTextColor(COL_TEXT_DARK)
            setHintTextColor(COL_TEXT_MUTED)
            inputType = inputTypeFlags
            minHeight = dp(ctx, 44)
            background = when {
                isClay -> {
                    val topC = if (isDark) 0xFF181C34.toInt() else 0xFFE6E4F8.toInt()
                    val botC = if (isDark) 0xFF23284A.toInt() else 0xFFF7F6FF.toInt()
                    val rimC = if (isDark) 0xFF0E1022.toInt() else 0xFFCCC7EA.toInt()
                    claySurfaceDrawable(topC, botC, rimC, COL_BORDER, 13f, ctx, recessed = true)
                }
                isPastelGlass -> pastelGlassSurfaceDrawable(ctx, radiusDp = 13f, subtle = true)
                else -> roundedBg(COL_SUBTLE, 9f, ctx, COL_BORDER, 1f)
            }
            val px = rdp(ctx, 11)
            val py = rdp(ctx, 9)
            setPadding(px, py, px, py)
        }
    }

    /**
     * Centered, tabular-numeral set input box designed specifically for compact tracker columns
     * (Weight, Reps, RPE) so multi-digit numbers never shift, clip, or look off-center on phones.
     */
    fun numericSetInputBox(ctx: Context, initialText: String, hintStr: String, inputTypeFlags: Int): EditText {
        return EditText(ctx).apply {
            setText(initialText)
            hint = hintStr
            textSize = rsp(ctx, 12.5f)
            setTypeface(Typeface.MONOSPACE, Typeface.BOLD)
            fontFeatureSettings = "tnum"
            gravity = Gravity.CENTER
            textAlignment = View.TEXT_ALIGNMENT_CENTER
            isSingleLine = true
            setHorizontallyScrolling(true)
            setTextColor(COL_TEXT_DARK)
            setHintTextColor(COL_TEXT_MUTED)
            inputType = inputTypeFlags
            minHeight = dp(ctx, 38)
            background = if (isPastelGlass) {
                pastelGlassSurfaceDrawable(ctx, radiusDp = 9f, subtle = false)
            } else {
                roundedBg(COL_CARD, 8f, ctx, COL_BORDER, 1f)
            }
            val px = rdp(ctx, 4)
            val py = rdp(ctx, 6)
            setPadding(px, py, px, py)
        }
    }

    /**
     * Claymorphism 32dp Rounded Login & Isolated Vault Shell:
     * Matches Web `UserAuthAndPrivacyModal.tsx` with 32dp corners, soft cushion bevels,
     * and subtle inner pastel/midnight gradients.
     */
    fun clayAuthDialogShell(ctx: Context): LinearLayout {
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val topC = if (isDark) 0xFF252B52.toInt() else 0xFFFFFFFF.toInt()
            val botC = if (isDark) 0xFF191D38.toInt() else 0xFFF2EEFF.toInt()
            val rimC = if (isDark) 0xFF0E1022.toInt() else 0xFFD4CEEE.toInt()
            val specC = if (isDark) 0xFF4F5998.toInt() else 0xFFFFFFFF.toInt()
            background = claySurfaceDrawable(topC, botC, rimC, specC, 32f, ctx, recessed = false)
            elevation = dp(ctx, 8).toFloat()
            val p = rdp(ctx, 18)
            setPadding(p, p, p, p)
        }
    }

    /**
     * Friendly Pale-Blue & Soft-Mint Circular Workout Progress Ring:
     * Matches Web `daily-completion-ring` in `Page2TrackSets.tsx` (`#93C5FD -> #60A5FA -> #6EE7B7` arc
     * over a low-stress track with centered tabular completion percentage and "Daily completion" caption).
     */
    fun circularProgressRing(
        ctx: Context,
        completionPct: Int,
        sizeDp: Int = 184,
        caption: String = "Daily completion"
    ): FrameLayout {
        val clampedPct = completionPct.coerceIn(0, 100)
        val pxSize = rdp(ctx, sizeDp)
        val strokePx = rdp(ctx, 13).toFloat().coerceAtLeast(8f)
        val trackCol = if (isDark) 0xFF1E293B.toInt() else 0xFFE2E8F0.toInt()

        val ringCanvasView = object : View(ctx) {
            private val trackPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = strokePx
                strokeCap = Paint.Cap.ROUND
                color = trackCol
            }
            private val arcPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
                style = Paint.Style.STROKE
                strokeWidth = strokePx
                strokeCap = Paint.Cap.ROUND
            }
            private val oval = RectF()

            override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
                super.onSizeChanged(w, h, oldw, oldh)
                val pad = strokePx * 0.85f
                oval.set(pad, pad, w - pad, h - pad)
                arcPaint.shader = LinearGradient(
                    0f,
                    0f,
                    w.toFloat(),
                    h.toFloat(),
                    intArrayOf(0xFF93C5FD.toInt(), 0xFF60A5FA.toInt(), 0xFF6EE7B7.toInt()),
                    floatArrayOf(0f, 0.52f, 1f),
                    Shader.TileMode.CLAMP
                )
            }

            override fun onDraw(canvas: Canvas) {
                super.onDraw(canvas)
                canvas.drawArc(oval, 0f, 360f, false, trackPaint)
                if (clampedPct > 0) {
                    val sweep = (clampedPct / 100f) * 360f
                    canvas.drawArc(oval, -90f, sweep, false, arcPaint)
                }
            }
        }.apply {
            contentDescription = "Today's workout completion: $clampedPct percent"
            layoutParams = FrameLayout.LayoutParams(pxSize, pxSize, Gravity.CENTER)
        }

        val centerStack = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER
            )
            addView(
                text(
                    ctx,
                    "$clampedPct%",
                    34f,
                    if (clampedPct >= 100) 0xFF059669.toInt() else COL_TEXT_DARK,
                    bold = true,
                    tabular = true
                ).apply {
                    gravity = Gravity.CENTER
                }
            )
            addView(spacerV(ctx, 2))
            addView(
                text(ctx, caption, 11.5f, COL_TEXT_MUTED, bold = false).apply {
                    gravity = Gravity.CENTER
                }
            )
        }

        return FrameLayout(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            )
            addView(ringCanvasView)
            addView(centerStack)
        }
    }

    /**
     * Tactile 185ms Expand / Collapse Card 'Pop' Animation:
     * Synchronized with Web `.hl-card-pop-expand` (`1 -> 1.018 -> 1`) and
     * `.hl-card-pop-collapse` (`1 -> 0.986 -> 1.004 -> 1`) while respecting system reduced-motion settings.
     */
    fun animateCardExpandCollapsePop(view: View, expanding: Boolean) {
        if (clayFlatDepth) return
        val animScale = runCatching {
            Settings.Global.getFloat(
                view.context.contentResolver,
                Settings.Global.ANIMATOR_DURATION_SCALE,
                1f
            )
        }.getOrDefault(1f)
        if (animScale <= 0f) return

        view.animate().cancel()
        view.scaleX = 1f
        view.scaleY = 1f
        if (expanding) {
            view.animate()
                .scaleX(1.018f)
                .scaleY(1.018f)
                .setDuration(82L)
                .withEndAction {
                    view.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .setDuration(103L)
                        .start()
                }
                .start()
        } else {
            view.animate()
                .scaleX(0.986f)
                .scaleY(0.986f)
                .setDuration(74L)
                .withEndAction {
                    view.animate()
                        .scaleX(1.004f)
                        .scaleY(1.004f)
                        .setDuration(56L)
                        .withEndAction {
                            view.animate()
                                .scaleX(1f)
                                .scaleY(1f)
                                .setDuration(55L)
                                .start()
                        }
                        .start()
                }
                .start()
        }
    }

    /**
     * Hardware-accelerated staggered entrance animation for exercise set rows in Tracker,
     * matching Framer Motion entrance physics in Web `Page2TrackSets.tsx`.
     */
    fun animateSetRowEntrance(view: View, index: Int) {
        if (clayFlatDepth) return
        val offsetPx = (10f * view.resources.displayMetrics.density)
        view.alpha = 0f
        view.translationY = offsetPx
        view.scaleX = 0.985f
        view.scaleY = 0.985f
        val delayMs = (index.coerceIn(0, 8) * 28L)
        view.animate()
            .alpha(1f)
            .translationY(0f)
            .scaleX(1f)
            .scaleY(1f)
            .setStartDelay(delayMs)
            .setDuration(210L)
            .start()
    }

    /**
     * Reusable collapsible dropdown card for Wellness and Settings sections so users can expand
     * or collapse tools, meal slots, hydration, breathwork, and calculators cleanly.
     */
    fun collapsibleDropdownCard(
        ctx: Context,
        title: String,
        subtitle: String,
        expanded: Boolean,
        badgeText: String = "",
        accentBorderColor: Int = COL_BORDER,
        onToggle: () -> Unit
    ): Pair<LinearLayout, LinearLayout> {
        val outer = card(ctx, borderColor = accentBorderColor, padDp = 13)
        val header = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            minimumHeight = dp(ctx, 42)
            attachInstantPressFeedback(this, 0.98f)
            setOnClickListener { onToggle() }
        }
        val titleCol = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        titleCol.addView(text(ctx, title, 15f, COL_TEXT_DARK, bold = true))
        if (subtitle.isNotBlank()) {
            titleCol.addView(spacerV(ctx, 2))
            titleCol.addView(text(ctx, subtitle, 11f, COL_TEXT_MUTED))
        }
        header.addView(titleCol)
        if (badgeText.isNotBlank()) {
            header.addView(text(ctx, badgeText, 11f, COL_ACCENT, bold = true, tabular = true).apply {
                val px = rdp(ctx, 8)
                val py = rdp(ctx, 4)
                setPadding(px, py, px, py)
                background = roundedBg(COL_SUBTLE, 8f, ctx, COL_BORDER, 1f)
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.WRAP_CONTENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    rightMargin = rdp(ctx, 6)
                }
            })
        }
        header.addView(text(ctx, if (expanded) "▴" else "▾", 14f, COL_ACCENT, bold = true).apply {
            val px = rdp(ctx, 8)
            val py = rdp(ctx, 4)
            setPadding(px, py, px, py)
        })
        outer.addView(header)

        val body = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            visibility = if (expanded) View.VISIBLE else View.GONE
        }
        if (expanded) {
            body.addView(spacerV(ctx, 8))
        }
        outer.addView(body)
        return outer to body
    }

    fun spacerV(ctx: Context, heightDp: Int): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, rdp(ctx, heightDp))
    }

    fun spacerH(ctx: Context, widthDp: Int): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(rdp(ctx, widthDp), 1)
    }
}

object NativeHardwareBridge {
    const val REQ_HEALTH_PERMISSIONS = 2040
    private val toneHandler = Handler(Looper.getMainLooper())

    private fun vibrator(ctx: Context): Vibrator? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                ctx.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
        } catch (_: Exception) {
            null
        }
    }

    fun hasVibrator(ctx: Context): Boolean {
        return try {
            vibrator(ctx)?.hasVibrator() == true
        } catch (_: Exception) {
            false
        }
    }

    fun hapticTick(ctx: Context) {
        try {
            val v = vibrator(ctx) ?: return
            if (v.hasVibrator()) {
                v.vibrate(VibrationEffect.createOneShot(30L, VibrationEffect.DEFAULT_AMPLITUDE))
            }
        } catch (_: Exception) {}
    }

    /**
     * Triple-pulse native vibration motor alert fired when the user-specified rest timer elapses.
     */
    fun hapticRestComplete(ctx: Context) {
        try {
            val v = vibrator(ctx) ?: return
            if (!v.hasVibrator()) return
            if (v.hasAmplitudeControl()) {
                v.vibrate(
                    VibrationEffect.createWaveform(
                        longArrayOf(0L, 280L, 110L, 280L, 110L, 420L),
                        intArrayOf(0, 255, 0, 255, 0, 255),
                        -1
                    )
                )
            } else {
                v.vibrate(VibrationEffect.createWaveform(longArrayOf(0L, 280L, 110L, 280L, 110L, 420L), -1))
            }
        } catch (_: Exception) {}
    }

    private fun fireToneSafe(toneType: Int, durationMs: Int, volume: Int = 85) {
        try {
            val tg = try {
                ToneGenerator(AudioManager.STREAM_NOTIFICATION, volume)
            } catch (_: Exception) {
                ToneGenerator(AudioManager.STREAM_MUSIC, volume)
            }
            tg.startTone(toneType, durationMs)
            toneHandler.postDelayed({
                try { tg.release() } catch (_: Exception) {}
            }, (durationMs + 90).toLong())
        } catch (_: Exception) {}
    }

    /**
     * Crisp confirmation chime played immediately when any timer is set, started, resumed, or preset-selected.
     */
    fun playTimerSetTone(ctx: Context, enabled: Boolean = true) {
        if (!enabled) return
        fireToneSafe(ToneGenerator.TONE_PROP_ACK, 90, 85)
    }

    /**
     * Subtle transition tone for guided breathwork / yoga / HIIT phase transitions.
     */
    fun playTimerStepTone(ctx: Context, enabled: Boolean = true) {
        if (!enabled) return
        fireToneSafe(ToneGenerator.TONE_PROP_BEEP, 65, 75)
    }

    /**
     * Clear dual-beep completion chime when a rest, pose, breathwork, or HIIT timer reaches 0:00.
     */
    fun playTimerCompleteTone(ctx: Context, enabled: Boolean = true) {
        if (!enabled) return
        fireToneSafe(ToneGenerator.TONE_PROP_BEEP2, 240, 95)
    }

    fun setKeepScreenOn(activity: Activity, enabled: Boolean) {
        if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    /**
     * Checks active connectivity across Mobile Data (4G/5G Cellular) and Wi-Fi for pulling online exercises.
     */
    fun getNetworkStatus(ctx: Context): Pair<Boolean, String> {
        return try {
            val cm = ctx.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false to "Offline"
            val net = cm.activeNetwork ?: return false to "Offline"
            val caps = cm.getNetworkCapabilities(net) ?: return false to "Offline"
            val hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            if (!hasInternet) return false to "Offline"
            val transport = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile Data"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> "Online"
            }
            true to transport
        } catch (_: Exception) {
            false to "Offline"
        }
    }

    fun isHealthConnectInstalled(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 34) return true
        val pm = ctx.packageManager
        val packages = listOf(
            "com.google.android.healthconnect.controller",
            "com.google.android.apps.healthdata"
        )
        for (pkg in packages) {
            try {
                pm.getPackageInfo(pkg, 0)
                return true
            } catch (_: Exception) {}
        }
        val probeIntents = listOf(
            Intent("android.health.connect.action.HEALTH_CONNECT_SETTINGS"),
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
        )
        return probeIntents.any { it.resolveActivity(pm) != null }
    }

    fun openHealthConnectPermissionsOrSettings(activity: Activity): Boolean {
        val pm = activity.packageManager
        val candidateIntents = listOf(
            Intent("android.health.connect.action.MANAGE_HEALTH_PERMISSIONS").apply {
                putExtra(Intent.EXTRA_PACKAGE_NAME, activity.packageName)
            },
            Intent("androidx.health.ACTION_MANAGE_HEALTH_PERMISSIONS").apply {
                putExtra(Intent.EXTRA_PACKAGE_NAME, activity.packageName)
            },
            Intent("android.health.connect.action.HEALTH_CONNECT_SETTINGS"),
            Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS"),
            pm.getLaunchIntentForPackage("com.google.android.healthconnect.controller"),
            pm.getLaunchIntentForPackage("com.google.android.apps.healthdata")
        ).filterNotNull()

        for (candidate in candidateIntents) {
            try {
                if (candidate.resolveActivity(pm) != null) {
                    activity.startActivity(candidate)
                    return true
                }
            } catch (_: Exception) {}
        }
        return false
    }

    @android.annotation.SuppressLint("NewApi")
    fun syncWorkoutToHealthConnect(
        activity: Activity,
        db: HyperLogDatabase,
        title: String,
        completedSets: Int,
        tonnageKg: Double,
        durationMinutes: Int,
        modality: String = "strength",
        onStatus: (String) -> Unit
    ) {
        val cleanDur = durationMinutes.coerceIn(5, 240)
        // Always record the sync ledger locally in SQLite first so nothing is ever lost offline
        db.logHealthConnectSync(
            summary = title,
            setsCount = completedSets,
            tonnageKg = tonnageKg,
            status = "Queued in Offline SQLite"
        )

        if (Build.VERSION.SDK_INT >= 34) {
            val writeGranted = activity.checkSelfPermission("android.permission.health.WRITE_EXERCISE") ==
                PackageManager.PERMISSION_GRANTED
            if (writeGranted) {
                try {
                    val hcManager = activity.getSystemService(HealthConnectManager::class.java)
                    if (hcManager != null) {
                        val endInstant = java.time.Instant.now()
                        val startInstant = endInstant.minusSeconds(cleanDur.toLong() * 60L)
                        val zoneOffset = java.time.ZoneId.systemDefault().rules.getOffset(endInstant)
                        val sessionType = when (modality.lowercase()) {
                            "yoga" -> ExerciseSessionType.EXERCISE_SESSION_TYPE_YOGA
                            "stretching", "mobility" -> ExerciseSessionType.EXERCISE_SESSION_TYPE_STRETCHING
                            "cardio", "hiit" -> ExerciseSessionType.EXERCISE_SESSION_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING
                            else -> ExerciseSessionType.EXERCISE_SESSION_TYPE_WEIGHTLIFTING
                        }
                        val meta = Metadata.Builder()
                            .setRecordingMethod(Metadata.RECORDING_METHOD_MANUAL_ENTRY)
                            .setClientRecordId("hl_${System.currentTimeMillis()}")
                            .build()
                        val record = ExerciseSessionRecord.Builder(meta, startInstant, endInstant, sessionType)
                            .setStartZoneOffset(zoneOffset)
                            .setEndZoneOffset(zoneOffset)
                            .setTitle(title)
                            .setNotes("HyperLog: $completedSets sets · ${tonnageKg.roundToInt()} kg")
                            .build()

                        hcManager.insertRecords(
                            listOf(record),
                            activity.mainExecutor,
                            object : OutcomeReceiver<InsertRecordsResponse, HealthConnectException> {
                                override fun onResult(result: InsertRecordsResponse) {
                                    db.logHealthConnectSync(
                                        summary = title,
                                        setsCount = completedSets,
                                        tonnageKg = tonnageKg,
                                        status = "Synced to Android Health Connect"
                                    )
                                    onStatus("✓ Synced '$title' ($completedSets sets) directly to Android Health Connect!")
                                }

                                override fun onError(error: HealthConnectException) {
                                    val opened = openHealthConnectPermissionsOrSettings(activity)
                                    onStatus(
                                        if (opened) "Opened Health Connect permissions (${error.message ?: "verify access"})."
                                        else "Saved '$title' in Offline SQLite (${error.message ?: "Health Connect error"})."
                                    )
                                }
                            }
                        )
                        return
                    }
                } catch (_: Exception) {
                    // Fall through to permission / settings intent
                }
            } else {
                try {
                    activity.requestPermissions(
                        arrayOf(
                            "android.permission.health.WRITE_EXERCISE",
                            "android.permission.health.READ_EXERCISE",
                            "android.permission.health.WRITE_NUTRITION",
                            "android.permission.health.WRITE_WEIGHT"
                        ),
                        REQ_HEALTH_PERMISSIONS
                    )
                    onStatus("Grant Health Connect permission in the Android prompt, then tap Sync again!")
                    return
                } catch (_: Exception) {
                    // Fall through to explicit settings screen
                }
            }
        }

        val opened = openHealthConnectPermissionsOrSettings(activity)
        if (opened) {
            db.logHealthConnectSync(
                summary = title,
                setsCount = completedSets,
                tonnageKg = tonnageKg,
                status = "Opened Health Connect"
            )
            onStatus("Opened Android Health Connect for '$title' (also saved in Offline SQLite).")
        } else {
            onStatus("Saved '$title' ($completedSets sets) in Offline SQLite. Install Health Connect from Play Store if using Android 13 or older.")
        }
    }

    fun openHealthConnectOrReportOffline(activity: Activity, summaryLabel: String): String {
        return if (openHealthConnectPermissionsOrSettings(activity)) {
            "Opened Android Health Connect ($summaryLabel)."
        } else {
            "Saved $summaryLabel locally in Offline SQLite (Health Connect UI not found on this device)."
        }
    }
}

/**
 * Offline PCM Synthesis Soundscape Engine for Guided Breathing Techniques.
 * Streams real-time calming harmonic pads, Tibetan singing bowls, ocean tide swells,
 * and gentle phase-transition bells synced to inhale / hold / exhale phases.
 */
object BreathingSoundscapeEngine {

    private const val SAMPLE_RATE = 22050

    @Volatile private var running: Boolean = false
    @Volatile var currentTrackId: String = "tibetan_bowl"
        private set
    @Volatile var volume: Float = 0.65f
        private set
    @Volatile var muted: Boolean = false
        private set
    @Volatile private var targetGain: Double = 0.55
    @Volatile private var chimeAmp: Double = 0.0

    private var workerThread: Thread? = null

    val isPlaying: Boolean get() = running

    fun setTrack(trackId: String) {
        currentTrackId = trackId
        chimeAmp = 0.35
    }

    fun setVolumeLevel(level: Float) {
        volume = level.coerceIn(0.05f, 1.0f)
    }

    fun setMutedState(isMuted: Boolean) {
        muted = isMuted
    }

    fun onPhaseChange(phaseKey: String) {
        targetGain = when (phaseKey) {
            "inhale" -> 0.85
            "hold_full" -> 0.72
            "exhale" -> 0.36
            else -> 0.28
        }
        chimeAmp = if (currentTrackId == "soft_chime") 0.55 else 0.26
    }

    @Synchronized
    fun start(trackId: String = currentTrackId, vol: Float = volume, isMuted: Boolean = muted) {
        currentTrackId = trackId
        volume = vol.coerceIn(0.05f, 1.0f)
        muted = isMuted
        if (running) return
        running = true
        targetGain = 0.75
        chimeAmp = 0.40

        workerThread = Thread {
            var track: AudioTrack? = null
            try {
                val minBuf = AudioTrack.getMinBufferSize(
                    SAMPLE_RATE,
                    AudioFormat.CHANNEL_OUT_MONO,
                    AudioFormat.ENCODING_PCM_16BIT
                ).coerceAtLeast(2048)

                track = AudioTrack.Builder()
                    .setAudioAttributes(
                        AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_MEDIA)
                            .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                            .build()
                    )
                    .setAudioFormat(
                        AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(SAMPLE_RATE)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build()
                    )
                    .setBufferSizeInBytes(minBuf * 2)
                    .setTransferMode(AudioTrack.MODE_STREAM)
                    .build()

                track.play()

                val chunkSamples = 1024
                val pcm = ShortArray(chunkSamples)
                var phase1 = 0.0
                var phase2 = 0.0
                var phase3 = 0.0
                var chimePhase = 0.0
                var lfoPhase = 0.0
                var smoothGain = 0.25
                var lpNoise = 0.0
                var rng = 0x5DEECE66DL
                val twoPi = Math.PI * 2.0

                while (running) {
                    val activeTrack = currentTrackId
                    val baseHz = when (activeTrack) {
                        "ocean_breeze" -> 174.0
                        "rain_pad" -> 264.0
                        "soft_chime" -> 198.0
                        else -> 216.0 // Tibetan singing bowl 216 / 432 Hz
                    }
                    val fifthHz = baseHz * 1.5
                    val octaveHz = baseHz * 2.002 // Subtle warm shimmer beating
                    val chimeHz = when (activeTrack) {
                        "rain_pad" -> 528.0
                        "ocean_breeze" -> 348.0
                        else -> 432.0
                    }

                    val inc1 = twoPi * baseHz / SAMPLE_RATE
                    val inc2 = twoPi * fifthHz / SAMPLE_RATE
                    val inc3 = twoPi * octaveHz / SAMPLE_RATE
                    val incChime = twoPi * chimeHz / SAMPLE_RATE
                    val incLfo = twoPi * 0.16 / SAMPLE_RATE

                    val masterVol = if (muted) 0.0 else (volume.toDouble() * 0.34)

                    for (i in 0 until chunkSamples) {
                        smoothGain += (targetGain - smoothGain) * 0.00045
                        lfoPhase += incLfo
                        if (lfoPhase > twoPi) lfoPhase -= twoPi
                        val lfo = 0.86 + 0.14 * kotlin.math.sin(lfoPhase)

                        phase1 += inc1; if (phase1 > twoPi) phase1 -= twoPi
                        phase2 += inc2; if (phase2 > twoPi) phase2 -= twoPi
                        phase3 += inc3; if (phase3 > twoPi) phase3 -= twoPi
                        chimePhase += incChime; if (chimePhase > twoPi) chimePhase -= twoPi

                        // Fast LCG pseudo-random noise for ocean tide & rain texture
                        rng = (rng * 25214903917L + 11L) and ((1L shl 48) - 1L)
                        val white = ((rng ushr 24).toInt() / 8388608.0) - 1.0
                        val cutoff = if (activeTrack == "ocean_breeze") 0.035 else 0.085
                        lpNoise += (white - lpNoise) * cutoff

                        val harmonicSample = when (activeTrack) {
                            "ocean_breeze" -> {
                                val surf = lpNoise * (0.45 + 0.40 * smoothGain)
                                val pad = 0.45 * kotlin.math.sin(phase1) + 0.25 * kotlin.math.sin(phase2)
                                surf * 0.65 + pad * 0.45 * smoothGain
                            }
                            "rain_pad" -> {
                                val rain = lpNoise * 0.28
                                val pad = 0.50 * kotlin.math.sin(phase1) +
                                    0.32 * kotlin.math.sin(phase2) +
                                    0.18 * kotlin.math.sin(phase3)
                                rain + pad * smoothGain * lfo
                            }
                            "soft_chime" -> {
                                val quietPad = 0.28 * kotlin.math.sin(phase1) * smoothGain
                                quietPad
                            }
                            else -> {
                                // Tibetan singing bowl
                                (0.55 * kotlin.math.sin(phase1) +
                                    0.28 * kotlin.math.sin(phase2) +
                                    0.22 * kotlin.math.sin(phase3)) * smoothGain * lfo
                            }
                        }

                        val bell = if (chimeAmp > 0.0005) {
                            val s = kotlin.math.sin(chimePhase) * chimeAmp
                            chimeAmp *= 0.99972
                            s
                        } else 0.0

                        val mixed = ((harmonicSample + bell) * masterVol).coerceIn(-0.92, 0.92)
                        pcm[i] = (mixed * 32767.0).toInt().toShort()
                    }

                    val written = track.write(pcm, 0, chunkSamples)
                    if (written < 0) break
                }
            } catch (_: Exception) {
                // Audio device unavailable; fail silently
            } finally {
                try {
                    track?.pause()
                    track?.flush()
                    track?.release()
                } catch (_: Exception) {}
            }
        }.apply {
            name = "HyperLog-BreathAudio"
            isDaemon = true
            start()
        }
    }

    @Synchronized
    fun stop() {
        running = false
        workerThread = null
    }
}

