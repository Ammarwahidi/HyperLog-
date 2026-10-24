package com.hyperlog.rp

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.Gravity
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

data class RirVisualPalette(
    val bgColor: Int,
    val borderColor: Int,
    val textColor: Int,
    val statusWord: String
)

data class SafeScreenInsets(
    val topPx: Int,
    val bottomPx: Int,
    val leftPx: Int,
    val rightPx: Int
)

object UiKit {
    var themeMode: AppThemeMode = AppThemeMode.DAYLIGHT

    val isDark: Boolean get() = themeMode.isDark

    val COL_BG: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFFF8FAFC.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF0B1120.toInt()
            AppThemeMode.AMOLED -> 0xFF000000.toInt()
            AppThemeMode.GRAPHITE -> 0xFF121316.toInt()
        }

    val COL_CARD: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFFFFFFFF.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF131C2E.toInt()
            AppThemeMode.AMOLED -> 0xFF0D0D12.toInt()
            AppThemeMode.GRAPHITE -> 0xFF1B1D22.toInt()
        }

    val COL_SUBTLE: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFFF1F5F9.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF1A253B.toInt()
            AppThemeMode.AMOLED -> 0xFF16161F.toInt()
            AppThemeMode.GRAPHITE -> 0xFF24272E.toInt()
        }

    val COL_BORDER: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFFE2E8F0.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF26334D.toInt()
            AppThemeMode.AMOLED -> 0xFF242432.toInt()
            AppThemeMode.GRAPHITE -> 0xFF30343E.toInt()
        }

    val COL_TEXT_DARK: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFF0F172A.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFFF1F5F9.toInt()
            AppThemeMode.AMOLED -> 0xFFF8FAFC.toInt()
            AppThemeMode.GRAPHITE -> 0xFFF3F4F6.toInt()
        }

    val COL_TEXT_MID: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFF334155.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFFCBD5E1.toInt()
            AppThemeMode.AMOLED -> 0xFFD4D4D8.toInt()
            AppThemeMode.GRAPHITE -> 0xFFD1D5DB.toInt()
        }

    val COL_TEXT_MUTED: Int
        get() = when (themeMode) {
            AppThemeMode.DAYLIGHT -> 0xFF64748B.toInt()
            AppThemeMode.NIGHT_SLATE -> 0xFF94A3B8.toInt()
            AppThemeMode.AMOLED -> 0xFFA1A1AA.toInt()
            AppThemeMode.GRAPHITE -> 0xFF9CA3AF.toInt()
        }

    val COL_ACCENT: Int
        get() = if (isDark) 0xFF3B82F6.toInt() else 0xFF2563EB.toInt()

    const val COL_FLAME_ORANGE = 0xFFF97316.toInt()

    val COL_CHIP_IDLE: Int
        get() = COL_SUBTLE

    val COL_CHIP_ACTIVE_BG: Int
        get() = if (isDark) 0xFF2563EB.toInt() else 0xFF0F172A.toInt()

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

    fun card(ctx: Context, borderColor: Int = COL_BORDER, borderDp: Float = 1f, padDp: Int = 14): LinearLayout {
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            background = roundedBg(COL_CARD, 14f, ctx, borderColor, borderDp)
            val p = rdp(ctx, padDp)
            setPadding(p, p, p, p)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                bottomMargin = rdp(ctx, 11)
            }
        }
    }

    fun metricBox(ctx: Context, label: String, value: String, valueColor: Int = COL_TEXT_DARK): LinearLayout {
        return LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            background = roundedBg(COL_SUBTLE, 10f, ctx, COL_BORDER, 1f)
            val px = rdp(ctx, 6)
            val py = rdp(ctx, 7)
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
            background = roundedBg(
                fillColor = if (active) COL_CHIP_ACTIVE_BG else COL_CHIP_IDLE,
                radiusDp = 10f,
                ctx = ctx,
                strokeColor = if (active) COL_CHIP_ACTIVE_BG else COL_BORDER,
                strokeWidthDp = 1f
            )
            minHeight = dp(ctx, 38)
            val px = rdp(ctx, 12)
            val py = rdp(ctx, 8)
            setPadding(px, py, px, py)
            gravity = Gravity.CENTER
            isSingleLine = true
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
            minHeight = dp(ctx, 44)
            val px = rdp(ctx, 14)
            val py = rdp(ctx, 10)
            setPadding(px, py, px, py)
            background = roundedBg(bgColor, 11f, ctx)
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
            minHeight = dp(ctx, 40)
            val px = rdp(ctx, 12)
            val py = rdp(ctx, 8)
            setPadding(px, py, px, py)
            background = roundedBg(COL_CARD, 10f, ctx, COL_BORDER, 1f)
            setOnClickListener { onClick() }
        }
    }

    fun progressBar(ctx: Context, fraction: Float, fillColor: Int): View {
        val outer = FrameLayout(ctx).apply {
            background = roundedBg(COL_CHIP_IDLE, 5f, ctx)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                dp(ctx, 9)
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
                    background = roundedBg(fillColor, 5f, ctx)
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
            minHeight = dp(ctx, 40)
            background = roundedBg(COL_SUBTLE, 9f, ctx, COL_BORDER, 1f)
            val px = rdp(ctx, 10)
            val py = rdp(ctx, 8)
            setPadding(px, py, px, py)
        }
    }

    fun spacerV(ctx: Context, heightDp: Int): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, rdp(ctx, heightDp))
    }

    fun spacerH(ctx: Context, widthDp: Int): View = View(ctx).apply {
        layoutParams = LinearLayout.LayoutParams(rdp(ctx, widthDp), 1)
    }
}

object NativeHardwareBridge {
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

    fun setKeepScreenOn(activity: Activity, enabled: Boolean) {
        if (enabled) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    }

    fun isHealthConnectInstalled(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT >= 34) return true
        return try {
            ctx.packageManager.getPackageInfo("com.google.android.apps.healthdata", 0)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun openHealthConnectOrReportOffline(activity: Activity, summaryLabel: String): String {
        return try {
            val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
            if (intent.resolveActivity(activity.packageManager) != null) {
                activity.startActivity(intent)
                "Opened Android Health Connect for $summaryLabel (Offline SQLite also saved)."
            } else {
                "Saved $summaryLabel locally in Offline SQLite (Health Connect app not installed on this device)."
            }
        } catch (_: Exception) {
            "Saved $summaryLabel locally in Offline SQLite."
        }
    }
}
