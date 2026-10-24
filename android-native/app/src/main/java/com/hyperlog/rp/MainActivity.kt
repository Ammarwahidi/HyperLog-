package com.hyperlog.rp

import android.app.Activity
import android.app.AlertDialog
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.widget.CheckBox
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Switch
import android.widget.TextView
import java.time.LocalDate
import java.time.format.TextStyle
import java.util.Locale
import kotlin.math.roundToInt

class MainActivity : Activity() {

    private lateinit var db: HyperLogDatabase
    private lateinit var rootColumn: LinearLayout
    private lateinit var topBar: LinearLayout
    private lateinit var topDivider: View
    private lateinit var bottomDivider: View
    private lateinit var headerTitleView: TextView
    private lateinit var headerSubtitle: TextView
    private lateinit var settingsTabBtn: TextView
    private lateinit var bannerView: TextView
    private lateinit var timerBar: LinearLayout
    private lateinit var timerText: TextView
    private lateinit var mainScroll: ScrollView
    private lateinit var pageContent: LinearLayout
    private lateinit var bottomNavRow: LinearLayout

    private var currentInsets = SafeScreenInsets(0, 0, 0, 0)

    // Optional live references inside Track tab's inline Rest Timer card
    private var inlineTimerClockView: TextView? = null
    private var inlineTimerStatusView: TextView? = null
    private var inlineTimerPlayPauseBtn: TextView? = null

    // UI State: 0=Anatomy, 1=Track, 2=Workouts, 3=Library, 4=Calories, 5=Settings
    private var activeTab: Int = 0
    private var activeWeek: Int = 3
    private var activeDay: Int = 5
    private var activeMajorGroup: MajorMuscleGroup = MajorMuscleGroup.ALL
    private var planeMode: String = "dual"
    private var userChosePlaneManually: Boolean = false
    private var selectedMuscleId: String = "chest"
    private var weightUnit: String = "kg"
    private var keepScreenOn: Boolean = true
    private var hapticEnabled: Boolean = true
    private var customRestDurationSec: Int = 90
    private var workoutsSubTab: String = "templates"
    private var libraryQuery: String = ""
    private var libraryGroupFilter: MajorMuscleGroup = MajorMuscleGroup.ALL
    private var libraryEquipFilter: String = "All"
    private var selectedDateIso: String = LocalDate.now().toString()
    private var standaloneSession: StandaloneSession? = null

    // Calories Tab: Calculator & Redesigned Offline Custom Meal Builder State
    private var showCalculatorPanel: Boolean = false
    private var calcSex: String = "male"
    private var calcAgeYears: Int = 28
    private var calcWeightKg: Double = 82.4
    private var calcHeightCm: Double = 178.0
    private var calcActivityId: String = "moderate"
    private var calcGoalId: String = "lean_mass"

    private var mealBuilderExpanded: Boolean = true
    private var builderMealType: String = "Post-Workout"
    private var builderMealName: String = ""
    private var builderFoodCategory: String = "All"
    private var builderFoodQuery: String = ""
    private val builderIngredients = mutableListOf<MealIngredientPick>()
    private var builderProteinG: Int = 0
    private var builderCarbsG: Int = 0
    private var builderFatG: Int = 0
    private var builderManualKcalOverride: Boolean = false
    private var builderManualKcal: Int = 0
    private var widgetPreviewTier: String = "auto"

    // Rest Countdown Timer
    private val mainHandler = Handler(Looper.getMainLooper())
    private var restSecondsRemaining: Int = 0
    private var restSecondsTotal: Int = 90
    private var restTimerRunning: Boolean = false
    private var restTimerFinishedAlert: Boolean = false
    private var restExerciseLabel: String = "Set Rest"

    private val timerTickRunnable = object : Runnable {
        override fun run() {
            if (!restTimerRunning) return
            if (restSecondsRemaining > 0) {
                restSecondsRemaining -= 1
                if (restSecondsRemaining == 0) {
                    restTimerRunning = false
                    restTimerFinishedAlert = true
                    if (hapticEnabled) {
                        NativeHardwareBridge.hapticRestComplete(this@MainActivity)
                    }
                    showBanner("Rest complete ($restExerciseLabel) — device vibration triggered!")
                    updateTimerUiLive()
                } else {
                    updateTimerUiLive()
                    mainHandler.postDelayed(this, 1000L)
                }
            }
        }
    }

    companion object {
        private const val REQ_EXPORT_JSON = 1001
        private const val REQ_IMPORT_JSON = 1002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        db = HyperLogDatabase.getInstance(this)

        val prefs = getSharedPreferences("hyperlog_prefs", Context.MODE_PRIVATE)
        UiKit.themeMode = AppThemeMode.fromId(prefs.getString("themeMode", "light"))
        activeWeek = prefs.getInt("activeWeek", 3)
        activeDay = prefs.getInt("activeDay", 5)
        weightUnit = prefs.getString("weightUnit", "kg") ?: "kg"
        keepScreenOn = prefs.getBoolean("keepScreenOn", true)
        hapticEnabled = prefs.getBoolean("hapticEnabled", true)
        customRestDurationSec = prefs.getInt("customRestDurationSec", 90).coerceIn(10, 600)
        restSecondsTotal = customRestDurationSec

        calcSex = prefs.getString("calcSex", "male") ?: "male"
        calcAgeYears = prefs.getInt("calcAgeYears", 28)
        calcWeightKg = prefs.getFloat("calcWeightKg", 82.4f).toDouble()
        calcHeightCm = prefs.getFloat("calcHeightCm", 178.0f).toDouble()
        calcActivityId = prefs.getString("calcActivityId", "moderate") ?: "moderate"
        calcGoalId = prefs.getString("calcGoalId", "lean_mass") ?: "lean_mass"

        // Auto-select single-plane anatomy view on compact portrait phones (< 380dp) for crisp tap precision
        planeMode = if (UiKit.isCompactPhone(this)) "anterior" else "dual"

        NativeHardwareBridge.setKeepScreenOn(this, keepScreenOn)
        db.ensureDaySetRowsMaterialized(activeWeek, activeDay)

        buildShellLayout()
        UiKit.configureSystemBarsAndInsets(this, rootColumn) { safe ->
            currentInsets = safe
            applySafeInsetsToShell(safe)
        }

        handleDeepLinkIntent(intent)
        rebuildTopSettingsButton()
        rebuildBottomNav()
        renderActivePage()
        HyperLogStreakWidgetProvider.refreshAllWidgets(this)
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (handleDeepLinkIntent(intent)) {
            rebuildTopSettingsButton()
            rebuildBottomNav()
            mainScroll.scrollTo(0, 0)
            renderActivePage()
        }
    }

    private fun handleDeepLinkIntent(intent: Intent?): Boolean {
        val target = intent?.getStringExtra(HyperLogStreakWidgetProvider.EXTRA_TARGET_TAB) ?: return false
        activeTab = when (target) {
            "anatomy" -> 0
            "track" -> 1
            "workouts" -> 2
            "library" -> 3
            "calories" -> 4
            "settings" -> 5
            else -> activeTab
        }
        return true
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (!userChosePlaneManually) {
            planeMode = if (UiKit.isCompactPhone(this)) "anterior" else "dual"
        }
        applySafeInsetsToShell(currentInsets)
        rebuildTopSettingsButton()
        rebuildBottomNav()
        renderActivePage()
    }

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    private fun savePrefs() {
        getSharedPreferences("hyperlog_prefs", Context.MODE_PRIVATE).edit()
            .putString("themeMode", UiKit.themeMode.id)
            .putInt("activeWeek", activeWeek)
            .putInt("activeDay", activeDay)
            .putString("weightUnit", weightUnit)
            .putBoolean("keepScreenOn", keepScreenOn)
            .putBoolean("hapticEnabled", hapticEnabled)
            .putInt("customRestDurationSec", customRestDurationSec)
            .putString("calcSex", calcSex)
            .putInt("calcAgeYears", calcAgeYears)
            .putFloat("calcWeightKg", calcWeightKg.toFloat())
            .putFloat("calcHeightCm", calcHeightCm.toFloat())
            .putString("calcActivityId", calcActivityId)
            .putString("calcGoalId", calcGoalId)
            .apply()
    }

    private fun applySafeInsetsToShell(safe: SafeScreenInsets) {
        val topSafe = safe.topPx.coerceAtLeast(UiKit.fallbackStatusBarHeightPx(this))
        val hPad = UiKit.rdp(this, 14)
        topBar.setPadding(
            safe.leftPx + hPad,
            topSafe + UiKit.dp(this, 8),
            safe.rightPx + hPad,
            UiKit.dp(this, 10)
        )

        val pagePad = UiKit.rdp(this, 12)
        pageContent.setPadding(
            safe.leftPx + pagePad,
            pagePad,
            safe.rightPx + pagePad,
            UiKit.dp(this, 24)
        )

        val navBottomSafe = safe.bottomPx.coerceAtLeast(UiKit.dp(this, 6))
        bottomNavRow.setPadding(
            safe.leftPx + UiKit.dp(this, 6),
            UiKit.dp(this, 6),
            safe.rightPx + UiKit.dp(this, 6),
            navBottomSafe + UiKit.dp(this, 4)
        )
    }

    private fun buildShellLayout() {
        rootColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(UiKit.COL_BG)
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.MATCH_PARENT
            )
        }

        // Top Bar: Crest + Wordmark + Streak Subtitle on Left | Single Clean Settings Tab Button on Right
        topBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(UiKit.COL_CARD)
        }

        val crestIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hyperlog_crest)
            scaleType = ImageView.ScaleType.FIT_CENTER
            val sz = UiKit.rdp(this@MainActivity, 32)
            layoutParams = LinearLayout.LayoutParams(sz, sz).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 9)
            }
            setOnClickListener {
                activeTab = 0
                rebuildTopSettingsButton()
                rebuildBottomNav()
                mainScroll.scrollTo(0, 0)
                renderActivePage()
            }
        }
        topBar.addView(crestIcon)

        val titleCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            setOnClickListener {
                activeTab = 0
                rebuildTopSettingsButton()
                rebuildBottomNav()
                mainScroll.scrollTo(0, 0)
                renderActivePage()
            }
        }
        headerTitleView = UiKit.text(this, "HyperLog", 18f, UiKit.COL_TEXT_DARK, bold = true).apply {
            isSingleLine = true
        }
        headerSubtitle = UiKit.text(this, "Week $activeWeek · Offline Hypertrophy", 11f, UiKit.COL_ACCENT, bold = true).apply {
            isSingleLine = true
        }
        titleCol.addView(headerTitleView)
        titleCol.addView(headerSubtitle)
        topBar.addView(titleCol)

        settingsTabBtn = TextView(this).apply {
            gravity = Gravity.CENTER
            minHeight = UiKit.dp(this@MainActivity, 40)
            isSingleLine = true
            setOnClickListener {
                activeTab = 5
                if (hapticEnabled) NativeHardwareBridge.hapticTick(this@MainActivity)
                rebuildTopSettingsButton()
                rebuildBottomNav()
                mainScroll.scrollTo(0, 0)
                renderActivePage()
            }
        }
        topBar.addView(settingsTabBtn)
        rootColumn.addView(topBar)

        // Hairline Divider
        topDivider = View(this).apply {
            setBackgroundColor(UiKit.COL_BORDER)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, UiKit.dp(this@MainActivity, 1))
        }
        rootColumn.addView(topDivider)

        // Status Toast Banner
        bannerView = UiKit.text(this, "", 12f, UiKit.COL_PURE_WHITE, bold = true).apply {
            setBackgroundColor(0xFF1E293B.toInt())
            val px = UiKit.rdp(this@MainActivity, 14)
            val py = UiKit.rdp(this@MainActivity, 9)
            setPadding(px, py, px, py)
            visibility = View.GONE
            setOnClickListener { visibility = View.GONE }
        }
        rootColumn.addView(bannerView)

        // Sticky Rest Countdown Bar (visible across tabs when timer is active)
        timerBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(0xFF0F172A.toInt())
            val px = UiKit.rdp(this@MainActivity, 12)
            val py = UiKit.rdp(this@MainActivity, 8)
            setPadding(px, py, px, py)
            visibility = View.GONE
        }
        timerText = UiKit.text(this, "Rest 0:00", 12.5f, UiKit.COL_PURE_WHITE, bold = true, tabular = true).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            isSingleLine = true
        }
        timerBar.addView(timerText)
        timerBar.addView(UiKit.chip(this, "-15s", false) { adjustRestTimer(-15) })
        timerBar.addView(UiKit.spacerH(this, 4))
        timerBar.addView(UiKit.chip(this, "+15s", false) { adjustRestTimer(15) })
        timerBar.addView(UiKit.spacerH(this, 4))
        timerBar.addView(UiKit.chip(this, "Stop", true) { stopRestTimer() })
        rootColumn.addView(timerBar)

        // Main Scrollable Viewport
        pageContent = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }
        mainScroll = ScrollView(this).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
            isFillViewport = true
            addView(pageContent)
        }
        rootColumn.addView(mainScroll)

        // Bottom Divider
        bottomDivider = View(this).apply {
            setBackgroundColor(UiKit.COL_BORDER)
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, UiKit.dp(this@MainActivity, 1))
        }
        rootColumn.addView(bottomDivider)

        // 5-Tab Bottom Navigation Bar
        bottomNavRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(UiKit.COL_CARD)
        }
        rootColumn.addView(bottomNavRow)

        applySafeInsetsToShell(SafeScreenInsets(UiKit.fallbackStatusBarHeightPx(this), UiKit.dp(this, 8), 0, 0))
        setContentView(rootColumn)
    }

    private fun rebuildTopSettingsButton() {
        val selected = activeTab == 5
        settingsTabBtn.text = "⚙ Settings"
        settingsTabBtn.textSize = UiKit.rsp(this, 12f)
        settingsTabBtn.setTypeface(settingsTabBtn.typeface, android.graphics.Typeface.BOLD)
        settingsTabBtn.setTextColor(if (selected) UiKit.COL_PURE_WHITE else UiKit.COL_TEXT_DARK)
        settingsTabBtn.background = UiKit.roundedBg(
            fillColor = if (selected) UiKit.COL_ACCENT else UiKit.COL_SUBTLE,
            radiusDp = 11f,
            ctx = this,
            strokeColor = if (selected) UiKit.COL_ACCENT else UiKit.COL_BORDER,
            strokeWidthDp = 1f
        )
        val px = UiKit.rdp(this, 12)
        val py = UiKit.rdp(this, 8)
        settingsTabBtn.setPadding(px, py, px, py)
    }

    private fun refreshShellTheme() {
        UiKit.refreshSystemBarIconLuminance(this)
        rootColumn.setBackgroundColor(UiKit.COL_BG)
        topBar.setBackgroundColor(UiKit.COL_CARD)
        topDivider.setBackgroundColor(UiKit.COL_BORDER)
        bottomDivider.setBackgroundColor(UiKit.COL_BORDER)
        bottomNavRow.setBackgroundColor(UiKit.COL_CARD)
        headerTitleView.setTextColor(UiKit.COL_TEXT_DARK)
        headerSubtitle.setTextColor(UiKit.COL_ACCENT)
        rebuildTopSettingsButton()
        rebuildBottomNav()
        renderActivePage()
    }

    private fun rebuildBottomNav() {
        bottomNavRow.removeAllViews()
        val tabs = listOf("Anatomy", "Track", "Workouts", "Library", "Calories")
        tabs.forEachIndexed { idx, label ->
            val selected = activeTab == idx
            val item = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                minimumHeight = UiKit.dp(this@MainActivity, 48)
                val py = UiKit.dp(this@MainActivity, 4)
                setPadding(UiKit.dp(this@MainActivity, 2), py, UiKit.dp(this@MainActivity, 2), py)
                background = if (selected) UiKit.roundedBg(UiKit.COL_SUBTLE, 11f, this@MainActivity) else null
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx < tabs.lastIndex) rightMargin = UiKit.dp(this@MainActivity, 3)
                }
                setOnClickListener {
                    activeTab = idx
                    rebuildTopSettingsButton()
                    rebuildBottomNav()
                    mainScroll.scrollTo(0, 0)
                    renderActivePage()
                }
            }
            val indicator = View(this).apply {
                background = UiKit.roundedBg(if (selected) UiKit.COL_ACCENT else 0x00000000, 3f, this@MainActivity)
                layoutParams = LinearLayout.LayoutParams(UiKit.rdp(this@MainActivity, 22), UiKit.dp(this@MainActivity, 3)).apply {
                    bottomMargin = UiKit.dp(this@MainActivity, 4)
                }
            }
            item.addView(indicator)
            item.addView(UiKit.text(
                this,
                label,
                if (UiKit.isCompactPhone(this)) 10.8f else 11.5f,
                if (selected) UiKit.COL_ACCENT else UiKit.COL_TEXT_MUTED,
                bold = selected
            ).apply {
                isSingleLine = true
                gravity = Gravity.CENTER
            })
            bottomNavRow.addView(item)
        }
    }

    private fun showBanner(msg: String) {
        bannerView.text = "$msg  (Tap to dismiss)"
        bannerView.visibility = View.VISIBLE
    }

    // =========================================================================
    // VIBRATION REST TIMER ENGINE
    // =========================================================================
    private fun formatClock(sec: Int): String {
        val clamped = sec.coerceAtLeast(0)
        return String.format(Locale.US, "%d:%02d", clamped / 60, clamped % 60)
    }

    private fun startRestTimer(seconds: Int, exerciseName: String) {
        mainHandler.removeCallbacks(timerTickRunnable)
        val target = seconds.coerceIn(5, 900)
        customRestDurationSec = target
        restSecondsTotal = target
        restSecondsRemaining = target
        restExerciseLabel = exerciseName
        restTimerFinishedAlert = false
        restTimerRunning = true
        savePrefs()
        updateTimerUiLive()
        mainHandler.postDelayed(timerTickRunnable, 1000L)
    }

    private fun togglePauseResumeRestTimer() {
        if (restTimerRunning) {
            restTimerRunning = false
            mainHandler.removeCallbacks(timerTickRunnable)
            updateTimerUiLive()
        } else {
            val startFrom = if (restSecondsRemaining > 0) restSecondsRemaining else customRestDurationSec
            restSecondsRemaining = startFrom
            restSecondsTotal = restSecondsTotal.coerceAtLeast(startFrom)
            restTimerFinishedAlert = false
            restTimerRunning = true
            updateTimerUiLive()
            mainHandler.removeCallbacks(timerTickRunnable)
            mainHandler.postDelayed(timerTickRunnable, 1000L)
        }
    }

    private fun adjustRestTimer(delta: Int) {
        if (restTimerRunning || restSecondsRemaining > 0) {
            val next = (restSecondsRemaining + delta).coerceIn(5, 900)
            restSecondsRemaining = next
            customRestDurationSec = next
            restSecondsTotal = maxOf(restSecondsTotal, next)
        } else {
            customRestDurationSec = (customRestDurationSec + delta).coerceIn(10, 900)
            restSecondsTotal = customRestDurationSec
        }
        restTimerFinishedAlert = false
        savePrefs()
        updateTimerUiLive()
    }

    private fun setPresetRestSeconds(sec: Int) {
        val clean = sec.coerceIn(10, 900)
        customRestDurationSec = clean
        restSecondsTotal = clean
        restTimerFinishedAlert = false
        savePrefs()
        if (restTimerRunning) {
            startRestTimer(clean, restExerciseLabel)
        } else {
            restSecondsRemaining = 0
            updateTimerUiLive()
            if (activeTab == 1 || activeTab == 5) renderActivePage()
        }
    }

    private fun stopRestTimer() {
        mainHandler.removeCallbacks(timerTickRunnable)
        restTimerRunning = false
        restSecondsRemaining = 0
        restTimerFinishedAlert = false
        updateTimerUiLive()
    }

    private fun updateTimerUiLive() {
        if (restSecondsRemaining > 0 && (restTimerRunning || activeTab != 1)) {
            timerText.text = "Rest ${formatClock(restSecondsRemaining)} · $restExerciseLabel"
            timerBar.visibility = View.VISIBLE
        } else {
            timerBar.visibility = View.GONE
        }

        val shownClock = if (restSecondsRemaining > 0 || restTimerRunning) restSecondsRemaining else customRestDurationSec
        inlineTimerClockView?.text = if (restTimerFinishedAlert && restSecondsRemaining == 0) "0:00" else formatClock(shownClock)
        inlineTimerClockView?.setTextColor(
            when {
                restTimerFinishedAlert -> 0xFF10B981.toInt()
                restTimerRunning -> UiKit.COL_ACCENT
                else -> UiKit.COL_TEXT_DARK
            }
        )
        inlineTimerStatusView?.text = when {
            restTimerFinishedAlert -> "REST COMPLETE · VIBRATED — START NEXT SET!"
            restTimerRunning -> "COUNTING DOWN · $restExerciseLabel"
            restSecondsRemaining > 0 -> "PAUSED · $restExerciseLabel"
            else -> "READY · TARGET ${customRestDurationSec}s (${formatClock(customRestDurationSec)})"
        }
        inlineTimerPlayPauseBtn?.text = when {
            restTimerRunning -> "Pause"
            restSecondsRemaining > 0 -> "Resume"
            else -> "Start ${customRestDurationSec}s"
        }
    }

    private fun renderActivePage() {
        inlineTimerClockView = null
        inlineTimerStatusView = null
        inlineTimerPlayPauseBtn = null

        val snap = db.getWidgetProgressSnapshot(activeWeek)
        headerSubtitle.text = "Week $activeWeek · 🔥 ${snap.streakDays}d Streak"
        pageContent.removeAllViews()
        when (activeTab) {
            0 -> renderAnatomyPage()
            1 -> renderTrackSetsPage()
            2 -> renderWorkoutsPage()
            3 -> renderLibraryPage()
            4 -> renderCaloriesPage()
            5 -> renderSettingsPage()
        }
        updateTimerUiLive()
    }

    // =========================================================================
    // PAGE 1: ANATOMY & HYPERTROPHY LANDMARKS (ADAPTIVE ACROSS ALL PHONES)
    // =========================================================================
    private fun renderAnatomyPage() {
        val landmarks = db.getLandmarks()
        val allSets = db.getSetLogs()
        val dayExercises = db.getDayExercises()
        val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]

        val completedWeekSets = allSets.filter { it.week == activeWeek && it.completed }
        val setsByMuscle = completedWeekSets
            .groupBy { it.muscleId }
            .mapValues { it.value.size }

        val freqByMuscle = dayExercises
            .groupBy { it.muscleId }
            .mapValues { (_, exs) -> exs.map { it.dayNumber }.distinct().sorted() }

        val weekCard = UiKit.card(this, padDp = 13)
        weekCard.addView(UiKit.text(this, "Anatomy & Volume Landmarks", 17f, UiKit.COL_TEXT_DARK, bold = true))
        weekCard.addView(UiKit.spacerV(this, 2))
        weekCard.addView(UiKit.text(this, "${weekMeta.fullLabel} · Target ${weekMeta.targetRir}", 12f, UiKit.COL_TEXT_MUTED))
        weekCard.addView(UiKit.spacerV(this, 10))

        // Equal 5-column responsive week selector
        val wkGrid = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        MESOCYCLE_WEEKS.forEachIndexed { idx, wm ->
            val shortTag = if (wm.week == 5) "Deload" else "Wk ${wm.week}"
            val btn = UiKit.chip(this, shortTag, activeWeek == wm.week) {
                activeWeek = wm.week
                savePrefs()
                db.ensureDaySetRowsMaterialized(activeWeek, activeDay)
                HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                renderActivePage()
            }.apply {
                val px = UiKit.rdp(this@MainActivity, 4)
                val py = UiKit.rdp(this@MainActivity, 8)
                setPadding(px, py, px, py)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx < MESOCYCLE_WEEKS.lastIndex) rightMargin = UiKit.rdp(this@MainActivity, 4)
                }
            }
            wkGrid.addView(btn)
        }
        weekCard.addView(wkGrid)
        pageContent.addView(weekCard)

        // Major Muscle Group Filter + Human Body Canvas Card
        val diagramCard = UiKit.card(this, padDp = 13)
        val topHeader = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        topHeader.addView(UiKit.text(this, "Muscle Map", 14.5f, UiKit.COL_TEXT_DARK, bold = true).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        listOf("anterior" to "Front", "posterior" to "Back", "dual" to "Dual").forEachIndexed { idx, (id, lbl) ->
            topHeader.addView(UiKit.chip(this, lbl, planeMode == id) {
                planeMode = id
                userChosePlaneManually = true
                renderActivePage()
            }.apply {
                val px = UiKit.rdp(this@MainActivity, 10)
                val py = UiKit.rdp(this@MainActivity, 6)
                setPadding(px, py, px, py)
            })
            if (idx < 2) topHeader.addView(UiKit.spacerH(this, 4))
        }
        diagramCard.addView(topHeader)
        diagramCard.addView(UiKit.spacerV(this, 8))

        val (grpScroll, grpRow) = UiKit.hScrollRow(this)
        MajorMuscleGroup.entries.forEach { grp ->
            grpRow.addView(UiKit.chip(this, grp.label, activeMajorGroup == grp) {
                activeMajorGroup = grp
                if (!grp.matchesMuscle(selectedMuscleId)) {
                    val fallback = landmarks.values.firstOrNull { grp.matchesMuscle(it.id) }
                    if (fallback != null) {
                        selectedMuscleId = fallback.id
                        if (planeMode != "dual" && fallback.plane in setOf("anterior", "posterior")) {
                            planeMode = fallback.plane
                        }
                    }
                }
                renderActivePage()
            })
            grpRow.addView(UiKit.spacerH(this, 6))
        }
        diagramCard.addView(grpScroll)
        diagramCard.addView(UiKit.spacerV(this, 8))

        val bodyView = HumanBodyDiagramView(this) { tappedMuscle ->
            selectedMuscleId = tappedMuscle
            if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
            renderActivePage()
        }.apply {
            this.planeMode = this@MainActivity.planeMode
            this.activeMajorGroup = this@MainActivity.activeMajorGroup
            this.selectedMuscleId = this@MainActivity.selectedMuscleId
            this.setsByMuscle = setsByMuscle
            this.landmarks = landmarks
        }
        diagramCard.addView(bodyView)
        diagramCard.addView(UiKit.spacerV(this, 8))

        // Quick-Select Region Strip
        diagramCard.addView(UiKit.text(this, "Tap Region to Inspect", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        diagramCard.addView(UiKit.spacerV(this, 5))
        val (quickScroll, quickRow) = UiKit.hScrollRow(this)
        val filteredList = landmarks.values.filter { activeMajorGroup.matchesMuscle(it.id) }
        filteredList.forEach { lm ->
            val mSets = setsByMuscle[lm.id] ?: 0
            quickRow.addView(UiKit.chip(this, "${lm.shortName} ($mSets)", selectedMuscleId == lm.id) {
                selectedMuscleId = lm.id
                if (planeMode != "dual" && lm.plane in setOf("anterior", "posterior")) {
                    planeMode = lm.plane
                }
                if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
                renderActivePage()
            })
            quickRow.addView(UiKit.spacerH(this, 6))
        }
        diagramCard.addView(quickScroll)
        pageContent.addView(diagramCard)

        // Selected Muscle Inspector Card
        val selectedLm = landmarks[selectedMuscleId] ?: landmarks.values.firstOrNull()
        if (selectedLm != null) {
            val logged = setsByMuscle[selectedLm.id] ?: 0
            val zone = evaluateVolumeZone(logged, selectedLm)
            val daysHitting = freqByMuscle[selectedLm.id] ?: emptyList()
            val muscleSetRows = completedWeekSets.filter { it.muscleId == selectedLm.id }
            val avgRirStr = if (muscleSetRows.isNotEmpty()) {
                String.format(Locale.US, "%.1f RIR", muscleSetRows.map { it.rir }.average())
            } else "—"
            val loadVal = if (weightUnit == "lb") {
                "${(muscleSetRows.sumOf { it.weightKg * it.reps } * 2.20462).roundToInt()} lb"
            } else {
                "${muscleSetRows.sumOf { it.weightKg * it.reps }.roundToInt()} kg"
            }

            val inspCard = UiKit.card(this, borderColor = UiKit.COL_ACCENT, borderDp = 1.5f, padDp = 14)
            val titleRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val titleLeft = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            titleLeft.addView(UiKit.text(this, selectedLm.name, 16f, UiKit.COL_TEXT_DARK, bold = true))
            titleLeft.addView(UiKit.text(this, "${zone.fullLabel} · $logged sets logged", 12f, zone.strokeColor, bold = true, tabular = true))
            titleRow.addView(titleLeft)
            titleRow.addView(UiKit.outlineButton(this, "Edit") { showEditLandmarkDialog(selectedLm) })
            inspCard.addView(titleRow)

            inspCard.addView(UiKit.progressBar(this, logged.toFloat() / selectedLm.mrv.coerceAtLeast(1).toFloat(), zone.fillColor))
            inspCard.addView(UiKit.spacerV(this, 4))

            val lmGrid = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            listOf(
                "MV" to "${selectedLm.mv}",
                "MEV" to "${selectedLm.mev}",
                "MAV" to "${selectedLm.mavMin}–${selectedLm.mavMax}",
                "MRV" to "${selectedLm.mrv}"
            ).forEachIndexed { idx, (lbl, v) ->
                val colColor = if (lbl == "MAV") UiKit.COL_ACCENT else UiKit.COL_TEXT_DARK
                lmGrid.addView(UiKit.metricBox(this, lbl, v, colColor).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        if (idx < 3) rightMargin = UiKit.rdp(this@MainActivity, 5)
                    }
                })
            }
            inspCard.addView(lmGrid)
            inspCard.addView(UiKit.spacerV(this, 6))

            val freqTargetClean = formatFreqRange(selectedLm.freqMin, selectedLm.freqMax)
            val freqDisplay = "${daysHitting.size}x (${freqTargetClean.removeSuffix("/wk")})"
            val statRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            listOf(
                "Freq" to freqDisplay,
                "Avg Effort" to avgRirStr,
                "Volume Load" to loadVal
            ).forEachIndexed { idx, (lbl, v) ->
                statRow.addView(UiKit.metricBox(this, lbl, v).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        if (idx < 2) rightMargin = UiKit.rdp(this@MainActivity, 5)
                    }
                })
            }
            inspCard.addView(statRow)
            inspCard.addView(UiKit.spacerV(this, 8))
            inspCard.addView(UiKit.text(this, selectedLm.guidance, 12f, UiKit.COL_TEXT_MUTED))

            if (daysHitting.isNotEmpty()) {
                inspCard.addView(UiKit.spacerV(this, 10))
                val (dScroll, dRow) = UiKit.hScrollRow(this)
                daysHitting.forEach { dNum ->
                    dRow.addView(UiKit.outlineButton(this, "Track Day $dNum →", UiKit.COL_ACCENT) {
                        standaloneSession = null
                        activeDay = dNum
                        savePrefs()
                        db.ensureDaySetRowsMaterialized(activeWeek, activeDay)
                        activeTab = 1
                        rebuildTopSettingsButton()
                        rebuildBottomNav()
                        renderActivePage()
                    })
                    dRow.addView(UiKit.spacerH(this, 8))
                }
                inspCard.addView(dScroll)
            }
            pageContent.addView(inspCard)
        }

        pageContent.addView(UiKit.text(this, "${activeMajorGroup.label} Landmarks (${filteredList.size})", 14f, UiKit.COL_TEXT_DARK, bold = true))
        pageContent.addView(UiKit.spacerV(this, 8))

        filteredList.forEach { lm ->
            val logged = setsByMuscle[lm.id] ?: 0
            val zone = evaluateVolumeZone(logged, lm)
            val freq = freqByMuscle[lm.id]?.size ?: 0
            val freqTarget = formatFreqRange(lm.freqMin, lm.freqMax)
            val isSel = lm.id == selectedMuscleId

            val mCard = UiKit.card(this, borderColor = if (isSel) UiKit.COL_ACCENT else UiKit.COL_BORDER, borderDp = if (isSel) 1.5f else 1f, padDp = 12)
            mCard.setOnClickListener {
                selectedMuscleId = lm.id
                renderActivePage()
            }
            val row = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            row.addView(UiKit.text(this, lm.name, 14f, UiKit.COL_TEXT_DARK, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            row.addView(UiKit.text(this, "$logged/${lm.mavMin}–${lm.mavMax} · ${zone.shortLabel}", 11.5f, zone.strokeColor, bold = true, tabular = true))
            mCard.addView(row)
            mCard.addView(UiKit.progressBar(this, logged.toFloat() / lm.mrv.coerceAtLeast(1).toFloat(), zone.fillColor))

            val metaBottom = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            metaBottom.addView(UiKit.text(this, "MV ${lm.mv} · MEV ${lm.mev} · MAV ${lm.mavMin}–${lm.mavMax} · MRV ${lm.mrv}", 11f, UiKit.COL_TEXT_MUTED, tabular = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            metaBottom.addView(UiKit.text(this, "Freq ${freq}x ($freqTarget)", 11f, UiKit.COL_TEXT_MID, bold = true, tabular = true))
            mCard.addView(metaBottom)
            pageContent.addView(mCard)
        }
    }

    private fun showEditLandmarkDialog(lm: MuscleLandmark) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        val mvIn = UiKit.inputBox(this, lm.mv.toString(), "MV", InputType.TYPE_CLASS_NUMBER)
        val mevIn = UiKit.inputBox(this, lm.mev.toString(), "MEV", InputType.TYPE_CLASS_NUMBER)
        val mavMinIn = UiKit.inputBox(this, lm.mavMin.toString(), "MAV Min", InputType.TYPE_CLASS_NUMBER)
        val mavMaxIn = UiKit.inputBox(this, lm.mavMax.toString(), "MAV Max", InputType.TYPE_CLASS_NUMBER)
        val mrvIn = UiKit.inputBox(this, lm.mrv.toString(), "MRV", InputType.TYPE_CLASS_NUMBER)

        listOf("MV (Maintenance)" to mvIn, "MEV (Minimum Effective)" to mevIn, "MAV Min" to mavMinIn, "MAV Max" to mavMaxIn, "MRV (Max Recoverable)" to mrvIn).forEach { (lbl, ed) ->
            box.addView(UiKit.text(this, lbl, 11f, UiKit.COL_TEXT_MUTED, bold = true))
            box.addView(ed)
            box.addView(UiKit.spacerV(this, 6))
        }

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Tune ${lm.shortName} Landmarks")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                db.saveLandmark(lm.copy(
                    mv = mvIn.text.toString().toIntOrNull() ?: lm.mv,
                    mev = mevIn.text.toString().toIntOrNull() ?: lm.mev,
                    mavMin = mavMinIn.text.toString().toIntOrNull() ?: lm.mavMin,
                    mavMax = mavMaxIn.text.toString().toIntOrNull() ?: lm.mavMax,
                    mrv = mrvIn.text.toString().toIntOrNull() ?: lm.mrv
                ))
                showBanner("Updated volume landmarks for ${lm.shortName}")
                renderActivePage()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // PAGE 2: TRACK SETS + COLOR-CODED RIR DROPDOWN + VIBRATION REST TIMER
    // =========================================================================
    private fun renderTrackSetsPage() {
        val landmarks = db.getLandmarks()
        val days = db.getWorkoutDays()
        val allSets = db.getSetLogs()
        val feedbackMap = db.getFeedbackMap()
        val currentStandalone = standaloneSession

        val sessionCard = UiKit.card(this, padDp = 13)
        if (currentStandalone != null) {
            val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val left = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            left.addView(UiKit.text(this, "Standalone Template Session", 11f, UiKit.COL_ACCENT, bold = true))
            left.addView(UiKit.text(this, currentStandalone.templateName, 16f, UiKit.COL_TEXT_DARK, bold = true))
            top.addView(left)
            top.addView(UiKit.outlineButton(this, "Exit") {
                standaloneSession = null
                renderActivePage()
            })
            sessionCard.addView(top)
        } else {
            val wkGrid = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            MESOCYCLE_WEEKS.forEachIndexed { idx, wm ->
                val shortTag = if (wm.week == 5) "Deload" else "Wk ${wm.week}"
                wkGrid.addView(UiKit.chip(this, shortTag, activeWeek == wm.week) {
                    activeWeek = wm.week; savePrefs()
                    db.ensureDaySetRowsMaterialized(activeWeek, activeDay)
                    HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                    renderActivePage()
                }.apply {
                    val px = UiKit.rdp(this@MainActivity, 4)
                    val py = UiKit.rdp(this@MainActivity, 7)
                    setPadding(px, py, px, py)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                        if (idx < MESOCYCLE_WEEKS.lastIndex) rightMargin = UiKit.rdp(this@MainActivity, 4)
                    }
                })
            }
            sessionCard.addView(wkGrid)
            sessionCard.addView(UiKit.spacerV(this, 8))

            val (dayScroll, dayRow) = UiKit.hScrollRow(this)
            (1..7).forEach { d ->
                val isRest = days.find { it.dayNumber == d }?.isRestDay == true
                dayRow.addView(UiKit.chip(this, if (isRest) "Day $d (Rest)" else "Day $d", activeDay == d) {
                    activeDay = d; savePrefs()
                    db.ensureDaySetRowsMaterialized(activeWeek, activeDay)
                    renderActivePage()
                })
                dayRow.addView(UiKit.spacerH(this, 6))
            }
            sessionCard.addView(dayScroll)
            sessionCard.addView(UiKit.spacerV(this, 8))

            days.find { it.dayNumber == activeDay }?.let { dEnt ->
                sessionCard.addView(UiKit.text(this, dEnt.title, 15f, UiKit.COL_TEXT_DARK, bold = true))
                sessionCard.addView(UiKit.text(this, dEnt.focusSummary, 12f, UiKit.COL_TEXT_MUTED))
            }
        }
        pageContent.addView(sessionCard)

        // Dedicated Native Vibration Rest Timer Card
        val timerCard = UiKit.card(
            this,
            borderColor = if (restTimerFinishedAlert) 0xFF10B981.toInt() else if (restTimerRunning) UiKit.COL_ACCENT else UiKit.COL_BORDER,
            borderDp = if (restTimerRunning || restTimerFinishedAlert) 1.5f else 1f,
            padDp = 13
        )
        val tTop = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val tLeft = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val statusTv = UiKit.text(this, "VIBRATION REST TIMER", 10.5f, UiKit.COL_ACCENT, bold = true)
        val clockTv = UiKit.text(this, formatClock(customRestDurationSec), 27f, UiKit.COL_TEXT_DARK, bold = true, tabular = true)
        inlineTimerStatusView = statusTv
        inlineTimerClockView = clockTv
        tLeft.addView(statusTv)
        tLeft.addView(clockTv)
        tTop.addView(tLeft)

        val playPauseBtn = UiKit.primaryButton(this, "Start ${customRestDurationSec}s", UiKit.COL_ACCENT) {
            togglePauseResumeRestTimer()
        }
        inlineTimerPlayPauseBtn = playPauseBtn
        tTop.addView(playPauseBtn)
        tTop.addView(UiKit.spacerH(this, 6))
        tTop.addView(UiKit.outlineButton(this, "Reset") { stopRestTimer() })
        timerCard.addView(tTop)
        timerCard.addView(UiKit.spacerV(this, 8))

        val (presetScroll, presetRow) = UiKit.hScrollRow(this)
        presetRow.addView(UiKit.chip(this, "-15s", false) { adjustRestTimer(-15) })
        presetRow.addView(UiKit.spacerH(this, 5))
        listOf(60, 90, 120, 180).forEach { sec ->
            presetRow.addView(UiKit.chip(this, "${sec}s", customRestDurationSec == sec && !restTimerRunning) {
                setPresetRestSeconds(sec)
            })
            presetRow.addView(UiKit.spacerH(this, 5))
        }
        presetRow.addView(UiKit.chip(this, "+15s", false) { adjustRestTimer(15) })
        presetRow.addView(UiKit.spacerH(this, 5))
        presetRow.addView(UiKit.outlineButton(this, "Custom (${customRestDurationSec}s)", UiKit.COL_ACCENT) {
            showCustomRestSecondsDialog()
        })
        timerCard.addView(presetScroll)
        pageContent.addView(timerCard)

        // RIR Proximity Color Feedback Legend (Scroll-safe on narrow phones)
        val legendCard = UiKit.card(this, padDp = 10)
        val (legScroll, legRow) = UiKit.hScrollRow(this)
        val greenPal = UiKit.rirPalette(2.0)
        val yellowPal = UiKit.rirPalette(0.0)
        legRow.addView(UiKit.text(this, "RIR Feedback: ", 11.5f, UiKit.COL_TEXT_DARK, bold = true))
        legRow.addView(UiKit.text(this, " 1–3 RIR Optimal ", 11f, greenPal.textColor, bold = true).apply {
            background = UiKit.roundedBg(greenPal.bgColor, 6f, this@MainActivity, greenPal.borderColor, 1f)
            val px = UiKit.rdp(this@MainActivity, 6); val py = UiKit.rdp(this@MainActivity, 3)
            setPadding(px, py, px, py)
        })
        legRow.addView(UiKit.spacerH(this, 6))
        legRow.addView(UiKit.text(this, " <1 RIR Failure ", 11f, yellowPal.textColor, bold = true).apply {
            background = UiKit.roundedBg(yellowPal.bgColor, 6f, this@MainActivity, yellowPal.borderColor, 1f)
            val px = UiKit.rdp(this@MainActivity, 6); val py = UiKit.rdp(this@MainActivity, 3)
            setPadding(px, py, px, py)
        })
        legRow.addView(UiKit.spacerH(this, 6))
        legRow.addView(UiKit.text(this, "4+ Deload", 11f, UiKit.COL_TEXT_MUTED))
        legendCard.addView(legScroll)
        pageContent.addView(legendCard)

        data class TrackBlock(val exId: String, val name: String, val muscleId: String, val repRange: String, val restSec: Int, val defaultW: Double, val sets: List<SetLog>)

        val blocks: List<TrackBlock> = if (currentStandalone != null) {
            currentStandalone.exercises.map { item ->
                val rows = allSets.filter { it.templateSessionId == currentStandalone.sessionId && it.exerciseId == item.id }.sortedBy { it.setIndex }
                TrackBlock(item.id, item.name, item.primaryMuscle, item.reps, item.restSeconds, item.defaultWeightKg, rows)
            }
        } else {
            db.getDayExercises().filter { it.dayNumber == activeDay }.map { ex ->
                val rows = allSets.filter { it.templateSessionId == null && it.week == activeWeek && it.dayNumber == activeDay && it.exerciseId == ex.id }.sortedBy { it.setIndex }
                TrackBlock(ex.id, if (ex.isSuperset) "${ex.name} (SS)" else ex.name, ex.muscleId, ex.repRange, ex.restSeconds, ex.defaultWeightKg, rows)
            }
        }

        if (blocks.isEmpty()) {
            val restCard = UiKit.card(this)
            restCard.addView(UiKit.text(this, "Scheduled Active Recovery Day", 15f, UiKit.COL_TEXT_DARK, bold = true))
            restCard.addView(UiKit.text(this, "No lifting prescribed today. Hit 8,000–10,000 walking steps and log protein & carbs on the Calories tab.", 12f, UiKit.COL_TEXT_MUTED))
            pageContent.addView(restCard)
            return
        }

        var completedTotal = 0
        var tonnageKg = 0.0

        blocks.forEach { block ->
            val mName = landmarks[block.muscleId]?.shortName ?: block.muscleId
            val exCard = UiKit.card(this, padDp = 12)

            val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            val hLeft = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            hLeft.addView(UiKit.text(this, block.name, 15f, UiKit.COL_TEXT_DARK, bold = true))
            hLeft.addView(UiKit.text(this, "$mName · Target ${block.repRange} reps · Rest ${block.restSec}s", 11f, UiKit.COL_TEXT_MUTED))
            head.addView(hLeft)
            head.addView(UiKit.outlineButton(this, "Rest ${block.restSec}s", UiKit.COL_ACCENT) {
                startRestTimer(block.restSec, block.name)
            })
            exCard.addView(head)
            exCard.addView(UiKit.spacerV(this, 8))

            // Responsive Column Headers
            val colHead = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                val px = UiKit.rdp(this@MainActivity, 5)
                setPadding(px, 0, px, UiKit.dp(this@MainActivity, 4))
            }
            colHead.addView(UiKit.text(this, "SET", 9.5f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                width = UiKit.rdp(this@MainActivity, 28)
            })
            colHead.addView(UiKit.text(this, weightUnit.uppercase(), 9.5f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.90f)
            })
            colHead.addView(UiKit.spacerH(this, 4))
            colHead.addView(UiKit.text(this, "REPS", 9.5f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.72f)
            })
            colHead.addView(UiKit.spacerH(this, 4))
            colHead.addView(UiKit.text(this, "RIR", 9.5f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.35f)
            })
            colHead.addView(UiKit.text(this, "DONE", 9.5f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                gravity = Gravity.END
                width = UiKit.rdp(this@MainActivity, 38)
            })
            exCard.addView(colHead)

            block.sets.forEach { setRow ->
                if (setRow.completed) {
                    completedTotal += 1
                    tonnageKg += setRow.weightKg * setRow.reps
                }

                val rowLayout = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                    background = UiKit.roundedBg(
                        if (setRow.completed) UiKit.COL_ROW_COMPLETED else UiKit.COL_SUBTLE,
                        10f,
                        this@MainActivity,
                        if (setRow.completed) 0xFF10B981.toInt() else UiKit.COL_BORDER,
                        1f
                    )
                    val p = UiKit.rdp(this@MainActivity, 6)
                    setPadding(p, p, p, p)
                    layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                        bottomMargin = UiKit.rdp(this@MainActivity, 6)
                    }
                }

                rowLayout.addView(UiKit.text(this, "#${setRow.setIndex}", 12f, UiKit.COL_TEXT_DARK, bold = true, tabular = true).apply {
                    width = UiKit.rdp(this@MainActivity, 28)
                })

                val dispW = if (weightUnit == "lb") ((setRow.weightKg * 2.20462 * 10.0).roundToInt() / 10.0).toString()
                else setRow.weightKg.toString().removeSuffix(".0")

                val wInput = UiKit.inputBox(this, dispW, weightUnit, InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL).apply {
                    background = UiKit.roundedBg(UiKit.COL_CARD, 8f, this@MainActivity, UiKit.COL_BORDER, 1f)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.90f)
                }
                wInput.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        val v = s?.toString()?.toDoubleOrNull() ?: return
                        val kg = if (weightUnit == "lb") v / 2.20462 else v
                        db.saveSetLog(setRow.copy(weightKg = (kg * 100.0).roundToInt() / 100.0), notifyWidget = setRow.completed)
                    }
                })
                rowLayout.addView(wInput)
                rowLayout.addView(UiKit.spacerH(this, 4))

                val rInput = UiKit.inputBox(this, setRow.reps.toString(), "Reps", InputType.TYPE_CLASS_NUMBER).apply {
                    background = UiKit.roundedBg(UiKit.COL_CARD, 8f, this@MainActivity, UiKit.COL_BORDER, 1f)
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.72f)
                }
                rInput.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        val r = s?.toString()?.toIntOrNull() ?: return
                        db.saveSetLog(setRow.copy(reps = r.coerceAtLeast(0)), notifyWidget = setRow.completed)
                    }
                })
                rowLayout.addView(rInput)
                rowLayout.addView(UiKit.spacerH(this, 4))

                var latestRir = setRow.rir
                val rirSpinner = UiKit.rirDropdownSpinner(this, setRow.rir) { chosenRir ->
                    latestRir = chosenRir
                    val curW = wInput.text.toString().toDoubleOrNull()?.let { if (weightUnit == "lb") it / 2.20462 else it } ?: setRow.weightKg
                    val curR = rInput.text.toString().toIntOrNull() ?: setRow.reps
                    db.saveSetLog(setRow.copy(weightKg = curW, reps = curR, rir = chosenRir), notifyWidget = setRow.completed)
                    if (hapticEnabled) NativeHardwareBridge.hapticTick(this@MainActivity)
                }.apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.35f)
                }
                rowLayout.addView(rirSpinner)
                rowLayout.addView(UiKit.spacerH(this, 3))

                val cb = CheckBox(this).apply {
                    isChecked = setRow.completed
                    setOnCheckedChangeListener { _, checked ->
                        val curW = wInput.text.toString().toDoubleOrNull()?.let { if (weightUnit == "lb") it / 2.20462 else it } ?: setRow.weightKg
                        val curR = rInput.text.toString().toIntOrNull() ?: setRow.reps
                        db.saveSetLog(
                            setRow.copy(weightKg = curW, reps = curR, rir = latestRir, completed = checked),
                            notifyWidget = false
                        )
                        HyperLogStreakWidgetProvider.onSetCompleted(this@MainActivity)
                        if (checked) {
                            if (hapticEnabled) NativeHardwareBridge.hapticTick(this@MainActivity)
                            startRestTimer(customRestDurationSec, block.name)
                        }
                        renderActivePage()
                    }
                }
                rowLayout.addView(cb)
                exCard.addView(rowLayout)
            }

            // Footer: + Add Set | - Remove Set | Pump Biofeedback
            val (footScroll, foot) = UiKit.hScrollRow(this)
            foot.addView(UiKit.outlineButton(this, "+ Set") {
                val last = block.sets.lastOrNull()
                val weekMeta = MESOCYCLE_WEEKS.find { it.week == activeWeek } ?: MESOCYCLE_WEEKS[2]
                db.saveSetLog(SetLog(
                    id = "set_${System.currentTimeMillis()}",
                    week = activeWeek,
                    dayNumber = if (currentStandalone != null) 0 else activeDay,
                    templateSessionId = currentStandalone?.sessionId,
                    exerciseId = block.exId,
                    exerciseName = block.name,
                    muscleId = block.muscleId,
                    setIndex = (last?.setIndex ?: 0) + 1,
                    weightKg = last?.weightKg ?: block.defaultW,
                    reps = last?.reps ?: 10,
                    rir = last?.rir ?: weekMeta.defaultRirNumber,
                    restSeconds = block.restSec,
                    completed = false
                ))
                renderActivePage()
            })
            if (block.sets.size > 1) {
                foot.addView(UiKit.spacerH(this, 6))
                foot.addView(UiKit.outlineButton(this, "- Set", UiKit.COL_TEXT_MUTED) {
                    block.sets.lastOrNull()?.let {
                        db.deleteSetLog(it.id)
                        renderActivePage()
                    }
                })
            }
            foot.addView(UiKit.spacerH(this, 12))

            val fbKey = "w${activeWeek}_${block.muscleId}"
            val curPump = feedbackMap[fbKey]?.pumpScore ?: 2
            foot.addView(UiKit.text(this, "Pump: ", 11f, UiKit.COL_TEXT_MUTED))
            listOf(1 to "Low", 2 to "Good", 3 to "Max").forEachIndexed { idx, (sc, lbl) ->
                foot.addView(UiKit.chip(this, lbl, curPump == sc) {
                    db.saveFeedback(MuscleFeedback(fbKey, activeWeek, block.muscleId, sc, 1))
                    renderActivePage()
                })
                if (idx < 2) foot.addView(UiKit.spacerH(this, 4))
            }
            exCard.addView(footScroll)
            pageContent.addView(exCard)
        }

        pageContent.addView(UiKit.primaryButton(
            this,
            "Sync Workout ($completedTotal sets · ${tonnageKg.roundToInt()} kg) to Health Connect"
        ) {
            val msg = NativeHardwareBridge.openHealthConnectOrReportOffline(this, "Week $activeWeek Session ($completedTotal sets)")
            showBanner(msg)
        })
    }

    private fun showCustomRestSecondsDialog() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        box.addView(UiKit.text(this, "Enter Rest Time in Seconds (10 – 600s)", 12f, UiKit.COL_TEXT_MUTED, bold = true))
        box.addView(UiKit.spacerV(this, 6))
        val secIn = UiKit.inputBox(this, customRestDurationSec.toString(), "Seconds (e.g. 75, 105, 150)", InputType.TYPE_CLASS_NUMBER)
        box.addView(secIn)

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Custom Vibration Rest Timer")
            .setView(box)
            .setPositiveButton("Start Timer") { _, _ ->
                val v = secIn.text.toString().toIntOrNull()?.coerceIn(10, 600) ?: customRestDurationSec
                startRestTimer(v, restExerciseLabel)
                renderActivePage()
            }
            .setNeutralButton("Save Default") { _, _ ->
                val v = secIn.text.toString().toIntOrNull()?.coerceIn(10, 600) ?: customRestDurationSec
                setPresetRestSeconds(v)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // PAGE 3: WORKOUT TEMPLATES STUDIO + 7-DAY SCHEDULE
    // =========================================================================
    private fun renderWorkoutsPage() {
        val topRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = UiKit.rdp(this@MainActivity, 12)
            }
        }
        val templates = db.getTemplates()
        topRow.addView(UiKit.chip(this, "Templates (${templates.size})", workoutsSubTab == "templates") {
            workoutsSubTab = "templates"; renderActivePage()
        })
        topRow.addView(UiKit.spacerH(this, 6))
        topRow.addView(UiKit.chip(this, "7-Day Schedule", workoutsSubTab == "schedule") {
            workoutsSubTab = "schedule"; renderActivePage()
        })
        topRow.addView(View(this).apply { layoutParams = LinearLayout.LayoutParams(0, 1, 1f) })
        if (workoutsSubTab == "templates") {
            topRow.addView(UiKit.primaryButton(this, "+ New", UiKit.COL_ACCENT) {
                showTemplateStudioDialog(WorkoutTemplate(
                    "tpl_custom_${System.currentTimeMillis()}",
                    "Custom Hypertrophy Workout",
                    "Custom",
                    "Custom Split",
                    "Personalized offline hypertrophy template",
                    "[]",
                    System.currentTimeMillis()
                ))
            })
        }
        pageContent.addView(topRow)

        if (workoutsSubTab == "templates") {
            templates.forEach { tpl ->
                val items = tpl.parsedExercises()
                val tCard = UiKit.card(this)
                val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val hLeft = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                hLeft.addView(UiKit.text(this, "${tpl.category} · ${tpl.splitType}", 11f, UiKit.COL_ACCENT, bold = true))
                hLeft.addView(UiKit.text(this, tpl.name, 16f, UiKit.COL_TEXT_DARK, bold = true))
                head.addView(hLeft)
                if (tpl.category == "Custom") {
                    head.addView(UiKit.outlineButton(this, "Delete", 0xFFEF4444.toInt()) {
                        db.deleteTemplate(tpl.id)
                        showBanner("Deleted template '${tpl.name}'")
                        renderActivePage()
                    })
                }
                tCard.addView(head)
                tCard.addView(UiKit.text(this, tpl.description, 12f, UiKit.COL_TEXT_MUTED))
                tCard.addView(UiKit.spacerV(this, 6))

                items.forEachIndexed { idx, ex ->
                    tCard.addView(UiKit.text(this, "${idx + 1}. ${ex.name} — ${ex.sets} sets × ${ex.reps} (${ex.restSeconds}s rest)", 12f, UiKit.COL_TEXT_MID, tabular = true))
                }

                tCard.addView(UiKit.spacerV(this, 10))
                val (actScroll, actRow) = UiKit.hScrollRow(this)
                actRow.addView(UiKit.primaryButton(this, "Start Now") {
                    if (items.isNotEmpty()) {
                        standaloneSession = db.startStandaloneTemplate(tpl, activeWeek)
                        activeTab = 1
                        rebuildTopSettingsButton()
                        rebuildBottomNav()
                        renderActivePage()
                    }
                })
                actRow.addView(UiKit.spacerH(this, 8))
                actRow.addView(UiKit.outlineButton(this, "Assign Day") {
                    showAssignTemplateDialog(tpl)
                })
                actRow.addView(UiKit.spacerH(this, 8))
                actRow.addView(UiKit.outlineButton(this, "Edit") {
                    showTemplateStudioDialog(tpl)
                })
                tCard.addView(actScroll)
                pageContent.addView(tCard)
            }
        } else {
            val allDayEx = db.getDayExercises()
            db.getWorkoutDays().forEach { day ->
                val dCard = UiKit.card(this)
                val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val left = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                left.addView(UiKit.text(this, day.title, 15f, UiKit.COL_TEXT_DARK, bold = true))
                left.addView(UiKit.text(this, day.focusSummary, 12f, UiKit.COL_TEXT_MUTED))
                head.addView(left)
                if (!day.isRestDay) {
                    head.addView(UiKit.primaryButton(this, "Track", UiKit.COL_ACCENT) {
                        standaloneSession = null
                        activeDay = day.dayNumber
                        savePrefs()
                        db.ensureDaySetRowsMaterialized(activeWeek, activeDay)
                        activeTab = 1
                        rebuildTopSettingsButton()
                        rebuildBottomNav()
                        renderActivePage()
                    })
                }
                dCard.addView(head)
                dCard.addView(UiKit.spacerV(this, 6))

                allDayEx.filter { it.dayNumber == day.dayNumber }.forEach { ex ->
                    val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                    r.addView(UiKit.text(this, "• ${ex.name} (${ex.setsForWeek(activeWeek)}×${ex.repRange}, ${ex.restSeconds}s)", 12f, UiKit.COL_TEXT_MID, tabular = true).apply {
                        layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    })
                    r.addView(UiKit.text(this, "✕", 13f, UiKit.COL_TEXT_MUTED, bold = true).apply {
                        val px = UiKit.dp(this@MainActivity, 8)
                        setPadding(px, px, px, px)
                        setOnClickListener {
                            db.removeDayExercise(ex.id)
                            HyperLogStreakWidgetProvider.refreshAllWidgets(this@MainActivity)
                            renderActivePage()
                        }
                    })
                    dCard.addView(r)
                }

                dCard.addView(UiKit.spacerV(this, 6))
                dCard.addView(UiKit.outlineButton(this, "+ Add Exercise from Library") {
                    showExercisePickerDialog { picked ->
                        db.appendExerciseToScheduleDay(day.dayNumber, picked, activeWeek)
                        HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                        showBanner("Added '${picked.name}' to Day ${day.dayNumber}")
                        renderActivePage()
                    }
                })
                pageContent.addView(dCard)
            }
        }
    }

    private fun showAssignTemplateDialog(tpl: WorkoutTemplate) {
        val labels = (1..7).map { "Assign to Day $it" }.toTypedArray()
        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Assign '${tpl.name}' to Schedule")
            .setItems(labels) { _, which ->
                val dayNum = which + 1
                db.assignTemplateToDay(tpl, dayNum, activeWeek)
                HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                showBanner("Assigned '${tpl.name}' to Day $dayNum")
                renderActivePage()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showTemplateStudioDialog(initial: WorkoutTemplate) {
        val items = initial.parsedExercises().toMutableList()
        val scroll = ScrollView(this)
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        scroll.addView(container)

        val nameIn = UiKit.inputBox(this, initial.name, "Template Name", InputType.TYPE_CLASS_TEXT)
        val splitIn = UiKit.inputBox(this, initial.splitType, "Split Tag (e.g. PPL, Upper/Lower)", InputType.TYPE_CLASS_TEXT)
        val itemsWrap = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }

        fun refreshItemsUi() {
            itemsWrap.removeAllViews()
            items.forEachIndexed { idx, it ->
                val box = UiKit.card(this, padDp = 10)
                val top = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                top.addView(UiKit.text(this, "${idx + 1}. ${it.name}", 13f, UiKit.COL_TEXT_DARK, bold = true).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                top.addView(UiKit.text(this, "Remove", 11f, 0xFFEF4444.toInt(), bold = true).apply {
                    val p = UiKit.dp(this@MainActivity, 4)
                    setPadding(p, p, p, p)
                    setOnClickListener { items.removeAt(idx); refreshItemsUi() }
                })
                box.addView(top)
                box.addView(UiKit.spacerV(this, 4))

                val editsRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
                val setsEd = UiKit.inputBox(this, it.sets.toString(), "Sets", InputType.TYPE_CLASS_NUMBER).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                val repsEd = UiKit.inputBox(this, it.reps, "Reps", InputType.TYPE_CLASS_TEXT).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                val restEd = UiKit.inputBox(this, it.restSeconds.toString(), "Rest(s)", InputType.TYPE_CLASS_NUMBER).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                setsEd.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                    override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        s?.toString()?.toIntOrNull()?.let { v -> items[idx] = items[idx].copy(sets = v.coerceIn(1, 15)) }
                    }
                })
                repsEd.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                    override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        val v = s?.toString() ?: return
                        if (v.isNotBlank()) items[idx] = items[idx].copy(reps = v)
                    }
                })
                restEd.addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
                    override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        s?.toString()?.toIntOrNull()?.let { v -> items[idx] = items[idx].copy(restSeconds = v.coerceIn(15, 600)) }
                    }
                })

                editsRow.addView(setsEd); editsRow.addView(UiKit.spacerH(this, 6))
                editsRow.addView(repsEd); editsRow.addView(UiKit.spacerH(this, 6))
                editsRow.addView(restEd)
                box.addView(editsRow)
                itemsWrap.addView(box)
            }
        }

        container.addView(UiKit.text(this, "Template Name", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        container.addView(nameIn)
        container.addView(UiKit.spacerV(this, 6))
        container.addView(UiKit.text(this, "Split Type", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        container.addView(splitIn)
        container.addView(UiKit.spacerV(this, 10))
        container.addView(itemsWrap)
        container.addView(UiKit.outlineButton(this, "+ Add Exercise from Library", UiKit.COL_ACCENT) {
            showExercisePickerDialog { picked ->
                items.add(TemplateExerciseItem(
                    "ti_${System.currentTimeMillis()}", picked.id, picked.name, picked.primaryMuscle,
                    3, picked.defaultRepRange, picked.defaultRestSeconds, picked.defaultWeightKg
                ))
                refreshItemsUi()
            }
        })
        refreshItemsUi()

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Workout Template Studio")
            .setView(scroll)
            .setPositiveButton("Save Template") { _, _ ->
                val savedId = if (initial.category == "Starter") "tpl_custom_${System.currentTimeMillis()}" else initial.id
                db.saveTemplate(WorkoutTemplate(
                    id = savedId,
                    name = nameIn.text.toString().ifBlank { "Custom Template" },
                    category = "Custom",
                    splitType = splitIn.text.toString().ifBlank { "Custom Split" },
                    description = initial.description,
                    exercisesJson = serializeTemplateItems(items),
                    updatedAtEpochMs = System.currentTimeMillis()
                ))
                showBanner("Saved workout template to offline SQLite")
                renderActivePage()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showExercisePickerDialog(onPicked: (LibraryExercise) -> Unit) {
        val lib = db.getLibraryExercises()
        val labels = lib.map { "${it.name} (${it.equipment} · ${it.majorGroup})" }.toTypedArray()
        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Select Exercise from Library")
            .setItems(labels) { _, which -> onPicked(lib[which]) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // PAGE 4: OFFLINE EXERCISE LIBRARY + SEARCH & FILTERS
    // =========================================================================
    private fun renderLibraryPage() {
        val landmarks = db.getLandmarks()
        val allLib = db.getLibraryExercises()
        val filtered = allLib.filter { ex ->
            val qOk = libraryQuery.isBlank() ||
                ex.name.contains(libraryQuery, ignoreCase = true) ||
                ex.description.contains(libraryQuery, ignoreCase = true) ||
                ex.primaryMuscle.contains(libraryQuery, ignoreCase = true)
            val gOk = libraryGroupFilter == MajorMuscleGroup.ALL || ex.majorGroup.equals(libraryGroupFilter.name, ignoreCase = true)
            val eOk = libraryEquipFilter == "All" || ex.equipment.equals(libraryEquipFilter, ignoreCase = true)
            qOk && gOk && eOk
        }

        val filterCard = UiKit.card(this)
        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        head.addView(UiKit.text(this, "Exercise Library (${filtered.size})", 16f, UiKit.COL_TEXT_DARK, bold = true).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        head.addView(UiKit.outlineButton(this, "+ Custom", UiKit.COL_ACCENT) { showCreateExerciseDialog() })
        filterCard.addView(head)
        filterCard.addView(UiKit.spacerV(this, 8))

        val searchBox = UiKit.inputBox(this, libraryQuery, "Search exercise, muscle, or cue...", InputType.TYPE_CLASS_TEXT)
        val searchRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        searchBox.layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        searchRow.addView(searchBox)
        searchRow.addView(UiKit.spacerH(this, 6))
        searchRow.addView(UiKit.primaryButton(this, "Search") {
            libraryQuery = searchBox.text.toString().trim()
            renderActivePage()
        })
        if (libraryQuery.isNotBlank()) {
            searchRow.addView(UiKit.spacerH(this, 4))
            searchRow.addView(UiKit.outlineButton(this, "Clear") {
                libraryQuery = ""; renderActivePage()
            })
        }
        filterCard.addView(searchRow)
        filterCard.addView(UiKit.spacerV(this, 8))

        val (gScroll, gRow) = UiKit.hScrollRow(this)
        MajorMuscleGroup.entries.forEach { grp ->
            gRow.addView(UiKit.chip(this, grp.label, libraryGroupFilter == grp) {
                libraryGroupFilter = grp; renderActivePage()
            })
            gRow.addView(UiKit.spacerH(this, 6))
        }
        filterCard.addView(gScroll)
        filterCard.addView(UiKit.spacerV(this, 6))

        val (eScroll, eRow) = UiKit.hScrollRow(this)
        listOf("All", "Barbell", "Dumbbell", "Cable", "Machine", "Smith Machine", "Bodyweight", "EZ Bar").forEach { eq ->
            eRow.addView(UiKit.chip(this, eq, libraryEquipFilter == eq) {
                libraryEquipFilter = eq; renderActivePage()
            })
            eRow.addView(UiKit.spacerH(this, 6))
        }
        filterCard.addView(eScroll)
        pageContent.addView(filterCard)

        filtered.forEach { ex ->
            val pName = landmarks[ex.primaryMuscle]?.shortName ?: ex.primaryMuscle
            val sNames = ex.secondaryList().map { landmarks[it]?.shortName ?: it }
            val c = UiKit.card(this, padDp = 13)
            c.setOnClickListener { showExerciseDetailDialog(ex, landmarks) }

            val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            r.addView(UiKit.text(this, ex.name, 15f, UiKit.COL_TEXT_DARK, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            r.addView(UiKit.text(this, "${ex.equipment} · ${ex.defaultRepRange}", 11f, UiKit.COL_ACCENT, bold = true))
            c.addView(r)
            c.addView(UiKit.spacerV(this, 4))
            c.addView(UiKit.text(this, ex.description, 12f, UiKit.COL_TEXT_MID))
            c.addView(UiKit.spacerV(this, 4))
            val muscleLine = if (sNames.isNotEmpty()) "Primary: $pName · Secondary: ${sNames.joinToString(", ")}" else "Primary: $pName"
            c.addView(UiKit.text(this, "$muscleLine  (Tap for steps & video)", 11f, UiKit.COL_TEXT_MUTED))
            pageContent.addView(c)
        }
    }

    private fun showExerciseDetailDialog(ex: LibraryExercise, landmarks: Map<String, MuscleLandmark>) {
        val scroll = ScrollView(this)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        scroll.addView(box)

        val pName = landmarks[ex.primaryMuscle]?.name ?: ex.primaryMuscle
        val sNames = ex.secondaryList().map { landmarks[it]?.shortName ?: it }

        box.addView(UiKit.text(this, "${ex.equipment} · Default ${ex.defaultRepRange} reps · ${ex.defaultRestSeconds}s rest", 12f, UiKit.COL_ACCENT, bold = true))
        box.addView(UiKit.spacerV(this, 6))
        box.addView(UiKit.text(this, ex.description, 13f, UiKit.COL_TEXT_DARK))
        box.addView(UiKit.spacerV(this, 10))
        box.addView(UiKit.text(this, "Muscles Targeted", 13f, UiKit.COL_TEXT_DARK, bold = true))
        box.addView(UiKit.text(this, "• Primary: $pName", 12f, UiKit.COL_TEXT_MID))
        if (sNames.isNotEmpty()) {
            box.addView(UiKit.text(this, "• Secondary: ${sNames.joinToString(", ")}", 12f, UiKit.COL_TEXT_MID))
        }
        box.addView(UiKit.spacerV(this, 10))
        box.addView(UiKit.text(this, "Step-by-Step Instructions", 13f, UiKit.COL_TEXT_DARK, bold = true))
        ex.instructionSteps().forEachIndexed { idx, step ->
            box.addView(UiKit.spacerV(this, 4))
            box.addView(UiKit.text(this, "${idx + 1}. $step", 12f, UiKit.COL_TEXT_MID))
        }

        if (ex.videoUrl.isNotBlank()) {
            box.addView(UiKit.spacerV(this, 12))
            box.addView(UiKit.outlineButton(this, "Watch Technique Video Demo ↗", UiKit.COL_ACCENT) {
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(ex.videoUrl)))
                } catch (_: Exception) {
                    showBanner("No browser installed on this device to open external video link.")
                }
            })
        }

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle(ex.name)
            .setView(scroll)
            .setPositiveButton("Done", null)
            .show()
    }

    private fun showCreateExerciseDialog() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        val nameIn = UiKit.inputBox(this, "", "Exercise Name", InputType.TYPE_CLASS_TEXT)
        val equipIn = UiKit.inputBox(this, "Dumbbell", "Equipment (Barbell, Cable, Machine...)", InputType.TYPE_CLASS_TEXT)
        val muscleIn = UiKit.inputBox(this, "chest", "Primary muscle ID (chest, back, quads, biceps...)", InputType.TYPE_CLASS_TEXT)
        val descIn = UiKit.inputBox(this, "", "Biomechanical description", InputType.TYPE_CLASS_TEXT)
        val stepsIn = UiKit.inputBox(this, "Brace core and set stable posture.\nControl 2–3s eccentric stretch.\nDrive smoothly to peak contraction.", "Instructions (1 step per line)", InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)

        listOf("Name" to nameIn, "Equipment" to equipIn, "Primary Muscle ID" to muscleIn, "Description" to descIn, "Instructions" to stepsIn).forEach { (l, v) ->
            box.addView(UiKit.text(this, l, 11f, UiKit.COL_TEXT_MUTED, bold = true))
            box.addView(v)
            box.addView(UiKit.spacerV(this, 6))
        }

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Create Custom Library Exercise")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                val nm = nameIn.text.toString().trim()
                if (nm.isNotEmpty()) {
                    val mId = muscleIn.text.toString().trim().ifBlank { "chest" }
                    val grp = MajorMuscleGroup.entries.firstOrNull { it != MajorMuscleGroup.ALL && it.matchesMuscle(mId) }?.name ?: "CHEST"
                    db.saveLibraryExercise(LibraryExercise(
                        "lib_custom_${System.currentTimeMillis()}", nm, grp, mId, "",
                        equipIn.text.toString().ifBlank { "Dumbbell" },
                        descIn.text.toString().ifBlank { "Custom offline hypertrophy exercise." },
                        stepsIn.text.toString(), "8–12", 90, 20.0, ""
                    ))
                    showBanner("Saved '$nm' to offline Exercise Library")
                    renderActivePage()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // PAGE 5: CALORIES + OFFLINE CALCULATOR + REDESIGNED OFFLINE MEAL BUILDER
    // =========================================================================
    private fun syncBuilderMacrosFromIngredients() {
        builderProteinG = builderIngredients.sumOf { it.macros.proteinG }
        builderCarbsG = builderIngredients.sumOf { it.macros.carbsG }
        builderFatG = builderIngredients.sumOf { it.macros.fatG }
        if (!builderManualKcalOverride) {
            builderManualKcal = autoCalculateCaloriesFromMacros(
                builderProteinG.toDouble(),
                builderCarbsG.toDouble(),
                builderFatG.toDouble()
            )
        }
        if (builderMealName.isBlank() && builderIngredients.isNotEmpty()) {
            builderMealName = builderIngredients.take(3).joinToString(" + ") {
                it.food.name.substringBefore(" (")
            }
        }
    }

    private fun renderCaloriesPage() {
        val metrics = db.getDailyMetrics(selectedDateIso)
        val meals = db.getMealsForDate(selectedDateIso)
        val savedCustomMeals = db.getSavedCustomMeals()
        val weeklySets = db.getSetLogs().count { it.week == activeWeek && it.completed }

        val phaseDelta = when (metrics.phase) {
            "Massing" -> 300; "Mini-Cut" -> -500; else -> 0
        }
        val stepBonus = ((metrics.steps - 6000).coerceAtLeast(0) * 0.035).roundToInt()
        val liftBonus = ((weeklySets * 16.5) / 7.0).roundToInt()
        val targetKcal = (metrics.baseTdee + phaseDelta + stepBonus + liftBonus).coerceAtLeast(1250)
        val targetP = (metrics.bodyweightKg * metrics.proteinPerKg).roundToInt().coerceAtLeast(95)
        val targetF = (metrics.bodyweightKg * (if (metrics.phase == "Mini-Cut") 0.75 else 0.85)).roundToInt().coerceAtLeast(42)
        val targetC = ((targetKcal - targetP * 4 - targetF * 9) / 4).coerceAtLeast(60)

        val eatenKcal = meals.sumOf { it.calories }
        val eatenP = meals.sumOf { it.proteinG }
        val eatenC = meals.sumOf { it.carbsG }
        val eatenF = meals.sumOf { it.fatG }

        // 1. 5-Day Date Selector Strip
        val (dateScroll, dateRow) = UiKit.hScrollRow(this)
        val today = LocalDate.now()
        (4 downTo 0).forEach { offset ->
            val dt = today.minusDays(offset.toLong())
            val dIso = dt.toString()
            val lbl = if (offset == 0) "Today (${dt.dayOfMonth})"
            else "${dt.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale.US)} ${dt.dayOfMonth}"
            dateRow.addView(UiKit.chip(this, lbl, selectedDateIso == dIso) {
                selectedDateIso = dIso
                renderActivePage()
            })
            dateRow.addView(UiKit.spacerH(this, 6))
        }
        pageContent.addView(dateScroll)
        pageContent.addView(UiKit.spacerV(this, 8))

        // 2. Daily Energy & Macro Progress Card
        val calCard = UiKit.card(this)
        val topHeader = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val topLeft = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        topLeft.addView(UiKit.text(this, "Calories & Macros ($selectedDateIso)", 16f, UiKit.COL_TEXT_DARK, bold = true))
        val remKcal = targetKcal - eatenKcal
        val remText = if (remKcal >= 0) "$remKcal kcal left" else "${-remKcal} kcal over"
        topLeft.addView(UiKit.text(this, "$eatenKcal / $targetKcal kcal · $remText", 13f, UiKit.COL_ACCENT, bold = true, tabular = true))
        topHeader.addView(topLeft)
        topHeader.addView(UiKit.outlineButton(this, if (showCalculatorPanel) "Hide Calc" else "Calorie Calc", UiKit.COL_ACCENT) {
            showCalculatorPanel = !showCalculatorPanel
            renderActivePage()
        })
        calCard.addView(topHeader)
        calCard.addView(UiKit.progressBar(this, eatenKcal.toFloat() / targetKcal.toFloat(), UiKit.COL_FLAME_ORANGE))
        calCard.addView(UiKit.spacerV(this, 6))

        val (phScroll, phRow) = UiKit.hScrollRow(this)
        listOf("Massing" to "Lean Mass (+300)", "Maintenance" to "Maintenance", "Mini-Cut" to "Mini-Cut (-500)").forEach { (phKey, phLbl) ->
            phRow.addView(UiKit.chip(this, phLbl, metrics.phase == phKey) {
                db.saveDailyMetrics(metrics.copy(phase = phKey))
                calcGoalId = GoalPhaseOption.fromDbPhase(phKey).id
                savePrefs()
                HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                renderActivePage()
            })
            phRow.addView(UiKit.spacerH(this, 6))
        }
        calCard.addView(phScroll)
        calCard.addView(UiKit.spacerV(this, 8))

        listOf(
            Triple("Protein", "$eatenP / ${targetP}g", eatenP.toFloat() / targetP.toFloat() to 0xFF3B82F6.toInt()),
            Triple("Carbohydrates", "$eatenC / ${targetC}g", eatenC.toFloat() / targetC.toFloat() to 0xFF10B981.toInt()),
            Triple("Dietary Fat", "$eatenF / ${targetF}g", eatenF.toFloat() / targetF.toFloat() to 0xFFF59E0B.toInt())
        ).forEach { (lbl, valStr, pair) ->
            val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            r.addView(UiKit.text(this, lbl, 12f, UiKit.COL_TEXT_MID, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            r.addView(UiKit.text(this, valStr, 12f, UiKit.COL_TEXT_DARK, bold = true, tabular = true))
            calCard.addView(r)
            calCard.addView(UiKit.progressBar(this, pair.first, pair.second))
        }

        // Scale Weight & Steps Row
        val bwDisp = if (weightUnit == "lb") ((metrics.bodyweightKg * 2.20462 * 10.0).roundToInt() / 10.0).toString()
        else ((metrics.bodyweightKg * 10.0).roundToInt() / 10.0).toString()
        val bwRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val bwIn = UiKit.inputBox(this, bwDisp, "Weight ($weightUnit)", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val stIn = UiKit.inputBox(this, metrics.steps.toString(), "Daily Steps", InputType.TYPE_CLASS_NUMBER).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        bwRow.addView(bwIn); bwRow.addView(UiKit.spacerH(this, 6))
        bwRow.addView(stIn); bwRow.addView(UiKit.spacerH(this, 6))
        bwRow.addView(UiKit.outlineButton(this, "Save") {
            val rawW = bwIn.text.toString().toDoubleOrNull()
            val newKg = if (rawW != null) {
                if (weightUnit == "lb") rawW / 2.20462 else rawW
            } else metrics.bodyweightKg
            db.saveDailyMetrics(metrics.copy(
                bodyweightKg = (newKg * 10.0).roundToInt() / 10.0,
                steps = stIn.text.toString().toIntOrNull() ?: metrics.steps
            ))
            HyperLogStreakWidgetProvider.refreshAllWidgets(this)
            showBanner("Saved bodyweight & daily steps offline")
            renderActivePage()
        })
        calCard.addView(UiKit.spacerV(this, 6))
        calCard.addView(bwRow)
        pageContent.addView(calCard)

        // 3. 100% OFFLINE CALORIE & MACRO CALCULATOR (Weight, Height, Age, Sex, Activity, Goal)
        val calcToggleBanner = if (!showCalculatorPanel) {
            UiKit.card(this, borderColor = UiKit.COL_ACCENT, borderDp = 1.2f, padDp = 12).apply {
                val r = LinearLayout(this@MainActivity).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val col = LinearLayout(this@MainActivity).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                col.addView(UiKit.text(this@MainActivity, "Offline Calorie & Macro Calculator", 14.5f, UiKit.COL_TEXT_DARK, bold = true))
                col.addView(UiKit.text(this@MainActivity, "Compute BMR, TDEE & macros by weight, height, age, sex, activity & goal", 11.5f, UiKit.COL_TEXT_MUTED))
                r.addView(col)
                r.addView(UiKit.primaryButton(this@MainActivity, "Open", UiKit.COL_ACCENT) {
                    showCalculatorPanel = true
                    renderActivePage()
                })
                addView(r)
            }
        } else null
        if (calcToggleBanner != null) {
            pageContent.addView(calcToggleBanner)
        } else {
            renderOfflineCalorieCalculatorCard(metrics)
        }

        // 4. REDESIGNED OFFLINE CUSTOM MEAL BUILDER (Offline Food Library + Live 4P+4C+9F Auto-Calc)
        renderRedesignedMealBuilderCard()

        // 5. 1-Tap Saved Custom & Hypertrophy Meal Presets
        val presetCard = UiKit.card(this, padDp = 13)
        presetCard.addView(UiKit.text(this, "1-Tap Saved Meals (${savedCustomMeals.size})", 14.5f, UiKit.COL_TEXT_DARK, bold = true))
        presetCard.addView(UiKit.text(this, "Tap any saved meal to log instantly offline", 11.5f, UiKit.COL_TEXT_MUTED))
        presetCard.addView(UiKit.spacerV(this, 8))

        val (pScroll, pRow) = UiKit.hScrollRow(this)
        savedCustomMeals.forEach { scm ->
            pRow.addView(UiKit.outlineButton(this, "+ ${scm.name} (${scm.calories} kcal)") {
                db.saveMeal(
                    MealLog(
                        "meal_${System.currentTimeMillis()}",
                        selectedDateIso,
                        scm.mealType,
                        scm.name,
                        scm.calories,
                        scm.proteinG,
                        scm.carbsG,
                        scm.fatG,
                        System.currentTimeMillis()
                    ),
                    notifyWidget = false
                )
                HyperLogStreakWidgetProvider.onMealSaved(this)
                if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
                showBanner("Logged '${scm.name}' (${scm.calories} kcal) · Home widget updated")
                renderActivePage()
            })
            pRow.addView(UiKit.spacerH(this, 6))
        }
        presetCard.addView(pScroll)
        pageContent.addView(presetCard)

        // 6. Logged Meals List for Selected Date
        pageContent.addView(UiKit.text(this, "Logged Meals · $selectedDateIso (${meals.size})", 14.5f, UiKit.COL_TEXT_DARK, bold = true))
        pageContent.addView(UiKit.spacerV(this, 6))

        if (meals.isEmpty()) {
            val emptyCard = UiKit.card(this, padDp = 13)
            emptyCard.addView(UiKit.text(this, "No meals logged for $selectedDateIso yet. Use the Offline Meal Builder or tap a Saved Meal above.", 12f, UiKit.COL_TEXT_MUTED))
            pageContent.addView(emptyCard)
        } else {
            meals.forEach { m ->
                val mc = UiKit.card(this, padDp = 12)
                val r = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
                val left = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                }
                left.addView(UiKit.text(this, "${m.mealType} · ${m.name}", 13.5f, UiKit.COL_TEXT_DARK, bold = true))
                left.addView(UiKit.text(this, "${m.calories} kcal · P ${m.proteinG}g · C ${m.carbsG}g · F ${m.fatG}g", 11.5f, UiKit.COL_TEXT_MUTED, tabular = true))
                r.addView(left)
                r.addView(UiKit.outlineButton(this, "Delete", 0xFFEF4444.toInt()) {
                    db.deleteMeal(m.id, notifyWidget = false)
                    HyperLogStreakWidgetProvider.onMealSaved(this)
                    renderActivePage()
                })
                mc.addView(r)
                pageContent.addView(mc)
            }
        }
    }

    private fun renderOfflineCalorieCalculatorCard(currentMetrics: DailyMetrics) {
        val card = UiKit.card(this, borderColor = UiKit.COL_ACCENT, borderDp = 1.5f, padDp = 14)

        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val hLeft = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        hLeft.addView(UiKit.text(this, "Offline Calorie & Macro Calculator", 16f, UiKit.COL_TEXT_DARK, bold = true))
        hLeft.addView(UiKit.text(this, "Mifflin-St Jeor BMR · 100% On-Device Calculation", 11.5f, UiKit.COL_TEXT_MUTED))
        head.addView(hLeft)
        head.addView(UiKit.outlineButton(this, "Close") {
            showCalculatorPanel = false
            renderActivePage()
        })
        card.addView(head)
        card.addView(UiKit.spacerV(this, 10))

        // Sex Selector
        card.addView(UiKit.text(this, "Biological Sex", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        card.addView(UiKit.spacerV(this, 4))
        val sexRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf("male" to "Male", "female" to "Female").forEachIndexed { idx, (id, lbl) ->
            sexRow.addView(UiKit.chip(this, lbl, calcSex == id) {
                calcSex = id; savePrefs(); renderActivePage()
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx == 0) rightMargin = UiKit.rdp(this@MainActivity, 6)
                }
            })
        }
        card.addView(sexRow)
        card.addView(UiKit.spacerV(this, 8))

        // Weight, Height, Age Inputs (3-column responsive grid)
        val dispW = if (weightUnit == "lb") ((calcWeightKg * 2.20462 * 10.0).roundToInt() / 10.0).toString()
        else ((calcWeightKg * 10.0).roundToInt() / 10.0).toString()

        val dimRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        val wCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 6)
            }
        }
        wCol.addView(UiKit.text(this, "Weight ($weightUnit)", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        val wEd = UiKit.inputBox(this, dispW, weightUnit, InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        wCol.addView(wEd)

        val hCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 6)
            }
        }
        hCol.addView(UiKit.text(this, "Height (cm)", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        val hEd = UiKit.inputBox(this, calcHeightCm.roundToInt().toString(), "cm", InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
        hCol.addView(hEd)

        val aCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.85f)
        }
        aCol.addView(UiKit.text(this, "Age (yrs)", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        val aEd = UiKit.inputBox(this, calcAgeYears.toString(), "Age", InputType.TYPE_CLASS_NUMBER)
        aCol.addView(aEd)

        dimRow.addView(wCol); dimRow.addView(hCol); dimRow.addView(aCol)
        card.addView(dimRow)
        card.addView(UiKit.spacerV(this, 8))

        // Activity Level Chips
        card.addView(UiKit.text(this, "Activity Level", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        card.addView(UiKit.spacerV(this, 4))
        val (actScroll, actRow) = UiKit.hScrollRow(this)
        ActivityLevelOption.entries.forEach { opt ->
            actRow.addView(UiKit.chip(this, opt.shortLabel, calcActivityId == opt.id) {
                wEd.text.toString().toDoubleOrNull()?.let { v -> calcWeightKg = if (weightUnit == "lb") v / 2.20462 else v }
                hEd.text.toString().toDoubleOrNull()?.let { v -> calcHeightCm = v }
                aEd.text.toString().toIntOrNull()?.let { v -> calcAgeYears = v }
                calcActivityId = opt.id
                savePrefs()
                renderActivePage()
            })
            actRow.addView(UiKit.spacerH(this, 6))
        }
        card.addView(actScroll)
        card.addView(UiKit.text(this, ActivityLevelOption.fromId(calcActivityId).detail, 11f, UiKit.COL_TEXT_MUTED))
        card.addView(UiKit.spacerV(this, 8))

        // Goal Phase Chips
        card.addView(UiKit.text(this, "Hypertrophy Goal", 11f, UiKit.COL_TEXT_MUTED, bold = true))
        card.addView(UiKit.spacerV(this, 4))
        val (goalScroll, goalRow) = UiKit.hScrollRow(this)
        GoalPhaseOption.entries.forEach { gOpt ->
            goalRow.addView(UiKit.chip(this, gOpt.label, calcGoalId == gOpt.id) {
                wEd.text.toString().toDoubleOrNull()?.let { v -> calcWeightKg = if (weightUnit == "lb") v / 2.20462 else v }
                hEd.text.toString().toDoubleOrNull()?.let { v -> calcHeightCm = v }
                aEd.text.toString().toIntOrNull()?.let { v -> calcAgeYears = v }
                calcGoalId = gOpt.id
                savePrefs()
                renderActivePage()
            })
            goalRow.addView(UiKit.spacerH(this, 6))
        }
        card.addView(goalScroll)
        card.addView(UiKit.spacerV(this, 10))

        // Live Computed Result Box (updates dynamically as user types!)
        val resultBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiKit.roundedBg(UiKit.COL_SUBTLE, 12f, this@MainActivity, UiKit.COL_BORDER, 1f)
            val p = UiKit.rdp(this@MainActivity, 12)
            setPadding(p, p, p, p)
        }
        val resHeadline = UiKit.text(this, "", 16f, UiKit.COL_ACCENT, bold = true, tabular = true)
        val resSub = UiKit.text(this, "", 11.5f, UiKit.COL_TEXT_MID, tabular = true)
        val resMacros = UiKit.text(this, "", 12.5f, UiKit.COL_TEXT_DARK, bold = true, tabular = true)
        resultBox.addView(resHeadline)
        resultBox.addView(UiKit.spacerV(this, 2))
        resultBox.addView(resSub)
        resultBox.addView(UiKit.spacerV(this, 4))
        resultBox.addView(resMacros)
        card.addView(resultBox)

        fun recomputePreview(): CalorieCalculationResult {
            val typedW = wEd.text.toString().toDoubleOrNull()?.let { if (weightUnit == "lb") it / 2.20462 else it } ?: calcWeightKg
            val typedH = hEd.text.toString().toDoubleOrNull() ?: calcHeightCm
            val typedAge = aEd.text.toString().toIntOrNull() ?: calcAgeYears
            val res = computeOfflineCalorieTargets(
                CalorieCalculatorProfile(calcSex, typedAge, typedW, typedH, calcActivityId, calcGoalId)
            )
            resHeadline.text = "Daily Target: ${res.targetCalories} kcal / day"
            resSub.text = "BMR ${res.bmrKcal} kcal · Maintenance TDEE ${res.tdeeKcal} kcal"
            resMacros.text = "Macros: Protein ${res.proteinG}g · Carbs ${res.carbsG}g · Fat ${res.fatG}g"
            return res
        }
        recomputePreview()

        val liveWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { recomputePreview() }
        }
        wEd.addTextChangedListener(liveWatcher)
        hEd.addTextChangedListener(liveWatcher)
        aEd.addTextChangedListener(liveWatcher)

        card.addView(UiKit.spacerV(this, 10))
        card.addView(UiKit.primaryButton(this, "Apply Calculated Targets Offline", UiKit.COL_ACCENT) {
            wEd.text.toString().toDoubleOrNull()?.let { v -> calcWeightKg = if (weightUnit == "lb") v / 2.20462 else v }
            hEd.text.toString().toDoubleOrNull()?.let { v -> calcHeightCm = v }
            aEd.text.toString().toIntOrNull()?.let { v -> calcAgeYears = v }
            savePrefs()

            val computed = computeOfflineCalorieTargets(
                CalorieCalculatorProfile(calcSex, calcAgeYears, calcWeightKg, calcHeightCm, calcActivityId, calcGoalId)
            )
            val goalEnum = GoalPhaseOption.fromId(calcGoalId)
            db.saveDailyMetrics(
                currentMetrics.copy(
                    bodyweightKg = (calcWeightKg * 10.0).roundToInt() / 10.0,
                    phase = goalEnum.dbPhaseName,
                    baseTdee = computed.tdeeKcal,
                    proteinPerKg = computed.proteinPerKg
                )
            )
            showCalculatorPanel = false
            HyperLogStreakWidgetProvider.refreshAllWidgets(this)
            if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
            showBanner("Applied ${computed.targetCalories} kcal (${computed.proteinG}P / ${computed.carbsG}C / ${computed.fatG}F) targets!")
            renderActivePage()
        })

        pageContent.addView(card)
    }

    private fun renderRedesignedMealBuilderCard() {
        val card = UiKit.card(this, padDp = 14)

        val head = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val hLeft = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        hLeft.addView(UiKit.text(this, "Offline Custom Meal Builder", 16f, UiKit.COL_TEXT_DARK, bold = true))
        hLeft.addView(UiKit.text(this, "Pick whole foods or enter macros — calories auto-calculate live", 11.5f, UiKit.COL_TEXT_MUTED))
        head.addView(hLeft)
        head.addView(UiKit.outlineButton(this, if (mealBuilderExpanded) "Collapse" else "Expand") {
            mealBuilderExpanded = !mealBuilderExpanded
            renderActivePage()
        })
        card.addView(head)

        if (!mealBuilderExpanded) {
            pageContent.addView(card)
            return
        }

        card.addView(UiKit.spacerV(this, 10))

        // Meal Timing Chips
        val (typeScroll, typeRow) = UiKit.hScrollRow(this)
        listOf("Breakfast", "Pre-Workout", "Post-Workout", "Dinner", "Snack").forEach { mt ->
            typeRow.addView(UiKit.chip(this, mt, builderMealType == mt) {
                builderMealType = mt
                renderActivePage()
            })
            typeRow.addView(UiKit.spacerH(this, 6))
        }
        card.addView(typeScroll)
        card.addView(UiKit.spacerV(this, 8))

        // Meal Name Input
        val nameEd = UiKit.inputBox(this, builderMealName, "Meal name (e.g. Post-Workout Chicken & Rice Bowl)", InputType.TYPE_CLASS_TEXT)
        nameEd.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                builderMealName = s?.toString() ?: ""
            }
        })
        card.addView(nameEd)
        card.addView(UiKit.spacerV(this, 10))

        // Part A: Offline Food Library Search & Picker
        val libBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiKit.roundedBg(UiKit.COL_SUBTLE, 12f, this@MainActivity, UiKit.COL_BORDER, 1f)
            val p = UiKit.rdp(this@MainActivity, 11)
            setPadding(p, p, p, p)
        }
        libBox.addView(UiKit.text(this, "1. Add Whole Foods from Offline Catalog (45 Foods)", 12.5f, UiKit.COL_TEXT_DARK, bold = true))
        libBox.addView(UiKit.spacerV(this, 6))

        val (catScroll, catRow) = UiKit.hScrollRow(this)
        listOf("All", "Protein", "Carbs", "Fats & Dairy", "Fruit & Veg").forEach { cat ->
            catRow.addView(UiKit.chip(this, cat, builderFoodCategory == cat) {
                builderFoodCategory = cat
                renderActivePage()
            })
            catRow.addView(UiKit.spacerH(this, 5))
        }
        libBox.addView(catScroll)
        libBox.addView(UiKit.spacerV(this, 6))

        val fSearchRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val fSearchIn = UiKit.inputBox(this, builderFoodQuery, "Filter foods (chicken, rice, oats, egg, whey...)", InputType.TYPE_CLASS_TEXT).apply {
            background = UiKit.roundedBg(UiKit.COL_CARD, 9f, this@MainActivity, UiKit.COL_BORDER, 1f)
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        fSearchRow.addView(fSearchIn)
        fSearchRow.addView(UiKit.spacerH(this, 6))
        fSearchRow.addView(UiKit.outlineButton(this, "Filter", UiKit.COL_ACCENT) {
            builderFoodQuery = fSearchIn.text.toString().trim()
            renderActivePage()
        })
        if (builderFoodQuery.isNotBlank()) {
            fSearchRow.addView(UiKit.spacerH(this, 4))
            fSearchRow.addView(UiKit.outlineButton(this, "✕") {
                builderFoodQuery = ""
                renderActivePage()
            })
        }
        libBox.addView(fSearchRow)
        libBox.addView(UiKit.spacerV(this, 8))

        val matchingFoods = SeedCatalog.offlineFoods().filter { f ->
            val cOk = builderFoodCategory == "All" || f.category.equals(builderFoodCategory, ignoreCase = true)
            val qOk = builderFoodQuery.isBlank() || f.name.contains(builderFoodQuery, ignoreCase = true)
            cOk && qOk
        }.take(6)

        matchingFoods.forEach { food ->
            val fRow = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = UiKit.roundedBg(UiKit.COL_CARD, 9f, this@MainActivity, UiKit.COL_BORDER, 1f)
                val px = UiKit.rdp(this@MainActivity, 9)
                val py = UiKit.rdp(this@MainActivity, 7)
                setPadding(px, py, px, py)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = UiKit.rdp(this@MainActivity, 5)
                }
            }
            val infoCol = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            infoCol.addView(UiKit.text(this, food.name, 12.5f, UiKit.COL_TEXT_DARK, bold = true))
            infoCol.addView(UiKit.text(
                this,
                "${food.unitHint} · ${food.kcalPerBase} kcal (${food.proteinPerBase.roundToInt()}P/${food.carbsPerBase.roundToInt()}C/${food.fatPerBase.roundToInt()}F)",
                10.5f,
                UiKit.COL_TEXT_MUTED,
                tabular = true
            ))
            fRow.addView(infoCol)
            fRow.addView(UiKit.outlineButton(this, "+ ${food.baseGrams}g", UiKit.COL_ACCENT) {
                val existingIdx = builderIngredients.indexOfFirst { it.food.id == food.id }
                if (existingIdx >= 0) {
                    val cur = builderIngredients[existingIdx]
                    builderIngredients[existingIdx] = cur.copy(grams = cur.grams + food.baseGrams)
                } else {
                    builderIngredients.add(MealIngredientPick(food, food.baseGrams))
                }
                syncBuilderMacrosFromIngredients()
                if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
                renderActivePage()
            })
            fRow.addView(UiKit.spacerH(this, 4))
            fRow.addView(UiKit.outlineButton(this, "Grams") {
                showFoodPortionDialog(food)
            })
            libBox.addView(fRow)
        }

        // Selected Ingredients Plate
        if (builderIngredients.isNotEmpty()) {
            libBox.addView(UiKit.spacerV(this, 6))
            val plateHead = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
            plateHead.addView(UiKit.text(this, "Current Meal Plate (${builderIngredients.size} items)", 11.5f, UiKit.COL_ACCENT, bold = true).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            })
            plateHead.addView(UiKit.text(this, "Clear Plate", 11f, 0xFFEF4444.toInt(), bold = true).apply {
                setOnClickListener {
                    builderIngredients.clear()
                    syncBuilderMacrosFromIngredients()
                    renderActivePage()
                }
            })
            libBox.addView(plateHead)
            libBox.addView(UiKit.spacerV(this, 4))

            builderIngredients.forEachIndexed { idx, pick ->
                val m = pick.macros
                val pRow = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    gravity = Gravity.CENTER_VERTICAL
                }
                pRow.addView(UiKit.text(
                    this,
                    "• ${pick.food.name} (${pick.grams}g) — ${m.calories} kcal · ${m.proteinG}P/${m.carbsG}C/${m.fatG}F",
                    11.5f,
                    UiKit.COL_TEXT_DARK,
                    tabular = true
                ).apply {
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                })
                pRow.addView(UiKit.text(this, "✕", 12.5f, 0xFFEF4444.toInt(), bold = true).apply {
                    val p = UiKit.dp(this@MainActivity, 6)
                    setPadding(p, p, p, p)
                    setOnClickListener {
                        builderIngredients.removeAt(idx)
                        syncBuilderMacrosFromIngredients()
                        renderActivePage()
                    }
                })
                libBox.addView(pRow)
            }
        }

        card.addView(libBox)
        card.addView(UiKit.spacerV(this, 10))

        // Part B: Direct Macro Inputs + Live 4P+4C+9F Auto-Calculated Calories
        card.addView(UiKit.text(this, "2. Macros & Auto-Calculated Calories (4×P + 4×C + 9×F)", 12.5f, UiKit.COL_TEXT_DARK, bold = true))
        card.addView(UiKit.spacerV(this, 6))

        val macroRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }

        fun buildMacroField(label: String, initialVal: Int, rightMarginDp: Int): Pair<LinearLayout, android.widget.EditText> {
            val col = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (rightMarginDp > 0) rightMargin = UiKit.rdp(this@MainActivity, rightMarginDp)
                }
            }
            col.addView(UiKit.text(this, label, 11f, UiKit.COL_TEXT_MUTED, bold = true))
            val ed = UiKit.inputBox(this, if (initialVal > 0) initialVal.toString() else "", "0", InputType.TYPE_CLASS_NUMBER)
            col.addView(ed)
            return col to ed
        }

        val (pCol, pEd) = buildMacroField("Protein (g)", builderProteinG, 6)
        val (cCol, cEd) = buildMacroField("Carbs (g)", builderCarbsG, 6)
        val (fCol, fEd) = buildMacroField("Fat (g)", builderFatG, 0)
        macroRow.addView(pCol); macroRow.addView(cCol); macroRow.addView(fCol)
        card.addView(macroRow)
        card.addView(UiKit.spacerV(this, 8))

        // Live Auto-Calculated Calorie Readout Strip
        val autoBox = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiKit.roundedBg(UiKit.COL_SUBTLE, 11f, this@MainActivity, UiKit.COL_ACCENT, 1.2f)
            val p = UiKit.rdp(this@MainActivity, 11)
            setPadding(p, p, p, p)
        }
        val autoKcalHeadline = UiKit.text(this, "", 16f, UiKit.COL_ACCENT, bold = true, tabular = true)
        val autoFormulaSub = UiKit.text(this, "", 11f, UiKit.COL_TEXT_MUTED, tabular = true)
        autoBox.addView(autoKcalHeadline)
        autoBox.addView(autoFormulaSub)

        val manualOverrideIn = UiKit.inputBox(
            this,
            if (builderManualKcal > 0) builderManualKcal.toString() else "",
            "Override calories (kcal)",
            InputType.TYPE_CLASS_NUMBER
        ).apply {
            visibility = if (builderManualKcalOverride) View.VISIBLE else View.GONE
        }

        val overrideRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
        }
        overrideRow.addView(UiKit.text(this, "Manual calorie override (for fiber/label rounding)", 11f, UiKit.COL_TEXT_MID).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        val ovSwitch = Switch(this).apply {
            isChecked = builderManualKcalOverride
            setOnCheckedChangeListener { _, checked ->
                builderManualKcalOverride = checked
                manualOverrideIn.visibility = if (checked) View.VISIBLE else View.GONE
                if (!checked) {
                    builderManualKcal = autoCalculateCaloriesFromMacros(
                        builderProteinG.toDouble(),
                        builderCarbsG.toDouble(),
                        builderFatG.toDouble()
                    )
                }
            }
        }
        overrideRow.addView(ovSwitch)
        autoBox.addView(UiKit.spacerV(this, 4))
        autoBox.addView(overrideRow)
        autoBox.addView(manualOverrideIn)
        card.addView(autoBox)

        fun refreshLiveAutoKcal() {
            val p = pEd.text.toString().toIntOrNull() ?: 0
            val c = cEd.text.toString().toIntOrNull() ?: 0
            val f = fEd.text.toString().toIntOrNull() ?: 0
            builderProteinG = p
            builderCarbsG = c
            builderFatG = f
            val formulaKcal = autoCalculateCaloriesFromMacros(p.toDouble(), c.toDouble(), f.toDouble())
            val finalKcal = if (builderManualKcalOverride) {
                manualOverrideIn.text.toString().toIntOrNull() ?: formulaKcal
            } else {
                builderManualKcal = formulaKcal
                formulaKcal
            }
            autoKcalHeadline.text = "Auto-Calculated Energy: $finalKcal kcal"
            autoFormulaSub.text = "${p}g P (${p * 4}) + ${c}g C (${c * 4}) + ${f}g F (${f * 9}) = $formulaKcal kcal"
        }
        refreshLiveAutoKcal()

        val macroWatcher = object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { refreshLiveAutoKcal() }
        }
        pEd.addTextChangedListener(macroWatcher)
        cEd.addTextChangedListener(macroWatcher)
        fEd.addTextChangedListener(macroWatcher)
        manualOverrideIn.addTextChangedListener(macroWatcher)

        card.addView(UiKit.spacerV(this, 10))

        // Action Buttons: + Log Meal Today | Save as Reusable Preset
        val actRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        actRow.addView(UiKit.primaryButton(this, "+ Log Meal", UiKit.COL_ACCENT) {
            val p = pEd.text.toString().toIntOrNull() ?: 0
            val c = cEd.text.toString().toIntOrNull() ?: 0
            val f = fEd.text.toString().toIntOrNull() ?: 0
            val autoKcal = autoCalculateCaloriesFromMacros(p.toDouble(), c.toDouble(), f.toDouble())
            val finalKcal = if (builderManualKcalOverride) (manualOverrideIn.text.toString().toIntOrNull() ?: autoKcal) else autoKcal
            val finalName = nameEd.text.toString().trim().ifBlank {
                if (builderIngredients.isNotEmpty()) builderIngredients.joinToString(" + ") { it.food.name.substringBefore(" (") }
                else "$builderMealType Custom Macro Meal"
            }

            if (finalKcal <= 0 && p == 0 && c == 0 && f == 0) {
                showBanner("Enter macros or pick a food item first to calculate calories!")
                return@primaryButton
            }

            db.saveMeal(
                MealLog(
                    id = "meal_${System.currentTimeMillis()}",
                    dateIso = selectedDateIso,
                    mealType = builderMealType,
                    name = finalName,
                    calories = finalKcal.coerceAtLeast(1),
                    proteinG = p,
                    carbsG = c,
                    fatG = f,
                    loggedAtEpochMs = System.currentTimeMillis()
                ),
                notifyWidget = false
            )
            builderMealName = ""
            builderIngredients.clear()
            builderProteinG = 0; builderCarbsG = 0; builderFatG = 0; builderManualKcal = 0
            HyperLogStreakWidgetProvider.onMealSaved(this)
            if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
            showBanner("Logged '$finalName' ($finalKcal kcal) · Home widget updated!")
            renderActivePage()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.2f).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 6)
            }
        })

        actRow.addView(UiKit.outlineButton(this, "Save Preset", UiKit.COL_ACCENT) {
            val p = pEd.text.toString().toIntOrNull() ?: 0
            val c = cEd.text.toString().toIntOrNull() ?: 0
            val f = fEd.text.toString().toIntOrNull() ?: 0
            val autoKcal = autoCalculateCaloriesFromMacros(p.toDouble(), c.toDouble(), f.toDouble())
            val finalKcal = if (builderManualKcalOverride) (manualOverrideIn.text.toString().toIntOrNull() ?: autoKcal) else autoKcal
            val finalName = nameEd.text.toString().trim().ifBlank { "Custom $builderMealType" }
            if (finalKcal > 0) {
                val summary = if (builderIngredients.isNotEmpty()) {
                    builderIngredients.joinToString(", ") { "${it.food.name.substringBefore(" (")} ${it.grams}g" }
                } else "${p}g P · ${c}g C · ${f}g F"
                db.saveCustomMealPreset(SavedCustomMeal(
                    "scm_${System.currentTimeMillis()}",
                    finalName,
                    builderMealType,
                    finalKcal,
                    p,
                    c,
                    f,
                    summary
                ))
                showBanner("Saved '$finalName' ($finalKcal kcal) to 1-Tap Presets!")
                renderActivePage()
            } else {
                showBanner("Enter macros or add ingredients before saving a preset.")
            }
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.9f)
        })

        card.addView(actRow)
        pageContent.addView(card)
    }

    private fun showFoodPortionDialog(food: OfflineFoodItem) {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            val p = UiKit.dp(this@MainActivity, 16)
            setPadding(p, p, p, p)
        }
        box.addView(UiKit.text(this, "Base serving: ${food.unitHint} = ${food.kcalPerBase} kcal", 12f, UiKit.COL_TEXT_MUTED))
        box.addView(UiKit.spacerV(this, 8))
        val gEd = UiKit.inputBox(this, food.baseGrams.toString(), "Portion in grams (g)", InputType.TYPE_CLASS_NUMBER)
        val previewTv = UiKit.text(this, "", 12.5f, UiKit.COL_ACCENT, bold = true, tabular = true)

        fun updatePortionPreview() {
            val g = gEd.text.toString().toIntOrNull() ?: food.baseGrams
            val sc = food.scaledMacros(g)
            previewTv.text = "${sc.grams}g = ${sc.calories} kcal · P ${sc.proteinG}g · C ${sc.carbsG}g · F ${sc.fatG}g"
        }
        updatePortionPreview()
        gEd.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { updatePortionPreview() }
        })

        val quickRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        listOf(50, 100, 150, 200).forEachIndexed { idx, gVal ->
            quickRow.addView(UiKit.chip(this, "${gVal}g", false) {
                gEd.setText(gVal.toString())
            }.apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx < 3) rightMargin = UiKit.dp(this@MainActivity, 5)
                }
            })
        }

        box.addView(quickRow)
        box.addView(UiKit.spacerV(this, 8))
        box.addView(gEd)
        box.addView(UiKit.spacerV(this, 8))
        box.addView(previewTv)

        AlertDialog.Builder(this, UiKit.dialogTheme())
            .setTitle("Add ${food.name}")
            .setView(box)
            .setPositiveButton("Add to Meal") { _, _ ->
                val g = (gEd.text.toString().toIntOrNull() ?: food.baseGrams).coerceIn(1, 2000)
                val existingIdx = builderIngredients.indexOfFirst { it.food.id == food.id }
                if (existingIdx >= 0) {
                    val cur = builderIngredients[existingIdx]
                    builderIngredients[existingIdx] = cur.copy(grams = cur.grams + g)
                } else {
                    builderIngredients.add(MealIngredientPick(food, g))
                }
                syncBuilderMacrosFromIngredients()
                renderActivePage()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // =========================================================================
    // PAGE 6: DEDICATED SETTINGS TAB (WIDGET + THEMES + PREFS + BACKUP)
    // =========================================================================
    private fun renderSettingsPage() {
        val snap = db.getWidgetProgressSnapshot(activeWeek)

        val headCard = UiKit.card(this, padDp = 14)
        headCard.addView(UiKit.text(this, "App Settings & Preferences", 18f, UiKit.COL_TEXT_DARK, bold = true))
        headCard.addView(UiKit.text(
            this,
            "Manage your Android Home Screen Widget, dark themes, workout rest haptics, units, and offline SQLite backups.",
            12f,
            UiKit.COL_TEXT_MUTED
        ))
        pageContent.addView(headCard)

        // 1. HOME SCREEN PROGRESS & STREAK WIDGET PREVIEW + DYNAMIC REMOTEVIEWS GRID SCALER
        val detectedSw = UiKit.screenWidthDp(this)
        val effectiveTier = when (widgetPreviewTier) {
            "compact" -> "compact"
            "standard" -> "standard"
            "expanded" -> "expanded"
            else -> when {
                detectedSw < 350 -> "compact"
                detectedSw >= 412 -> "expanded"
                else -> "standard"
            }
        }

        val widgetCard = UiKit.card(this, borderColor = UiKit.COL_ACCENT, borderDp = 1.5f, padDp = 14)
        widgetCard.addView(UiKit.text(this, "Home Screen Progress & Streak Widget", 15.5f, UiKit.COL_TEXT_DARK, bold = true))
        widgetCard.addView(UiKit.text(
            this,
            "Dynamic RemoteViews GridLayout that scales streak count & weekly mesocycle set progress bars to your phone display (${detectedSw}dp).",
            11.5f,
            UiKit.COL_TEXT_MUTED
        ))
        widgetCard.addView(UiKit.spacerV(this, 8))

        val (tierScroll, tierRow) = UiKit.hScrollRow(this)
        listOf(
            "auto" to "Auto (${detectedSw}dp)",
            "compact" to "Small Display",
            "standard" to "Standard 4×2",
            "expanded" to "Large / 4×3"
        ).forEachIndexed { idx, (key, lbl) ->
            tierRow.addView(UiKit.chip(this, lbl, widgetPreviewTier == key) {
                widgetPreviewTier = key
                renderActivePage()
            })
            if (idx < 3) tierRow.addView(UiKit.spacerH(this, 5))
        }
        widgetCard.addView(tierScroll)
        widgetCard.addView(UiKit.spacerV(this, 10))

        // Live Visual Preview matching dynamic RemoteViews GridLayouts
        val previewShell = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            background = UiKit.roundedBg(0xFF0C1324.toInt(), 18f, this@MainActivity, 0xFF233252.toInt(), 1f)
            val p = UiKit.rdp(this@MainActivity, if (effectiveTier == "compact") 10 else 12)
            setPadding(p, p, p, p)
        }
        val pvTop = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val pvIcon = ImageView(this).apply {
            setImageResource(R.drawable.ic_hyperlog_crest)
            val sz = UiKit.rdp(this@MainActivity, if (effectiveTier == "compact") 22 else 26)
            layoutParams = LinearLayout.LayoutParams(sz, sz).apply { rightMargin = UiKit.rdp(this@MainActivity, 8) }
        }
        pvTop.addView(pvIcon)
        val pvTitles = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        pvTitles.addView(UiKit.text(
            this,
            if (effectiveTier == "expanded") "HyperLog · Mesocycle" else "HyperLog",
            if (effectiveTier == "compact") 12f else 13.5f,
            0xFFF8FAFC.toInt(),
            bold = true
        ))
        pvTitles.addView(UiKit.text(
            this,
            if (effectiveTier == "compact") "Wk ${snap.activeWeek} · Best ${snap.bestStreakDays}d"
            else "${snap.weekSubtitle} · Best ${snap.bestStreakDays}d",
            if (effectiveTier == "compact") 9.5f else 10.5f,
            0xFF94A3B8.toInt()
        ))
        pvTop.addView(pvTitles)

        val streakLabelText = if (effectiveTier == "compact") "🔥 ${snap.streakDays}d" else "🔥 ${snap.streakDays}d Streak"
        val streakBadge = UiKit.text(this, streakLabelText, if (effectiveTier == "expanded") 12f else 11f, 0xFFFDBA74.toInt(), bold = true, tabular = true).apply {
            background = UiKit.roundedBg(0xFF3A1A08.toInt(), 10f, this@MainActivity, 0xFFF97316.toInt(), 1f)
            val px = UiKit.rdp(this@MainActivity, 9); val py = UiKit.rdp(this@MainActivity, 4)
            setPadding(px, py, px, py)
        }
        pvTop.addView(streakBadge)
        previewShell.addView(pvTop)
        previewShell.addView(UiKit.spacerV(this, 7))

        val pvDays = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        snap.last7Days.forEachIndexed { idx, (dChar, active) ->
            val isToday = idx == snap.last7Days.lastIndex
            val col = when {
                active && isToday -> 0xFFFDBA74.toInt()
                active -> 0xFFBAE6FD.toInt()
                else -> 0xFF64748B.toInt()
            }
            val bgCol = when {
                active && isToday -> 0xFF3A1A08.toInt()
                active -> 0xFF152B48.toInt()
                else -> 0xFF111A2E.toInt()
            }
            val brdCol = when {
                active && isToday -> 0xFFF97316.toInt()
                active -> 0xFF38BDF8.toInt()
                else -> 0xFF1E2D4A.toInt()
            }
            val label = if (effectiveTier == "compact") {
                if (active) "$dChar✓" else dChar
            } else {
                "$dChar ${if (active) "●" else "○"}"
            }
            pvDays.addView(UiKit.text(this, label, if (effectiveTier == "compact") 9f else 9.5f, col, bold = true).apply {
                gravity = Gravity.CENTER
                background = UiKit.roundedBg(bgCol, 6f, this@MainActivity, brdCol, 1f)
                val py = UiKit.rdp(this@MainActivity, 3)
                setPadding(0, py, 0, py)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    if (idx < 6) rightMargin = UiKit.rdp(this@MainActivity, 3)
                }
            })
        }
        previewShell.addView(pvDays)
        previewShell.addView(UiKit.spacerV(this, 7))

        val setsPct = ((snap.completedSets * 100.0) / snap.plannedSets.coerceAtLeast(1).toDouble()).roundToInt().coerceIn(0, 100)
        val kcalPct = ((snap.todayCalories * 100.0) / snap.targetCalories.coerceAtLeast(1).toDouble()).roundToInt().coerceIn(0, 100)

        if (effectiveTier == "compact") {
            val setsTile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = UiKit.roundedBg(0xFF141F38.toInt(), 11f, this@MainActivity, 0xFF253659.toInt(), 1f)
                val p = UiKit.rdp(this@MainActivity, 8)
                setPadding(p, p, p, p)
            }
            setsTile.addView(UiKit.text(this, "WK ${snap.activeWeek} MESOCYCLE SETS · ${snap.completedSets}/${snap.plannedSets}", 10.5f, 0xFFFFFFFF.toInt(), bold = true, tabular = true))
            setsTile.addView(UiKit.progressBar(this, setsPct / 100f, 0xFF3B82F6.toInt()))
            setsTile.addView(UiKit.text(this, "$setsPct% done · Full-width compact grid", 9f, 0xFF94A3B8.toInt(), tabular = true))
            previewShell.addView(setsTile)
            previewShell.addView(UiKit.spacerV(this, 5))

            val kcalTile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = UiKit.roundedBg(0xFF141F38.toInt(), 11f, this@MainActivity, 0xFF253659.toInt(), 1f)
                val p = UiKit.rdp(this@MainActivity, 8)
                setPadding(p, p, p, p)
            }
            kcalTile.addView(UiKit.text(this, "TODAY NUTRITION · ${snap.todayCalories}/${snap.targetCalories} kcal", 10.5f, 0xFFFFFFFF.toInt(), bold = true, tabular = true))
            kcalTile.addView(UiKit.progressBar(this, kcalPct / 100f, 0xFFF97316.toInt()))
            kcalTile.addView(UiKit.text(this, "Protein ${snap.todayProteinG}/${snap.targetProteinG}g", 9f, 0xFF94A3B8.toInt(), tabular = true))
            previewShell.addView(kcalTile)
        } else {
            val pvCols = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
            val leftTile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = UiKit.roundedBg(0xFF141F38.toInt(), 12f, this@MainActivity, 0xFF253659.toInt(), 1f)
                val p = UiKit.rdp(this@MainActivity, 9)
                setPadding(p, p, p, p)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    rightMargin = UiKit.rdp(this@MainActivity, 5)
                }
            }
            leftTile.addView(UiKit.text(this, "WEEKLY MESO SETS", 9.5f, 0xFF93C5FD.toInt(), bold = true))
            leftTile.addView(UiKit.text(this, "${snap.completedSets} / ${snap.plannedSets} sets", 12.5f, 0xFFFFFFFF.toInt(), bold = true, tabular = true))
            leftTile.addView(UiKit.progressBar(this, setsPct / 100f, 0xFF3B82F6.toInt()))
            leftTile.addView(UiKit.text(this, "$setsPct% of Wk ${snap.activeWeek}", 9.5f, 0xFF94A3B8.toInt(), tabular = true))

            val rightTile = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                background = UiKit.roundedBg(0xFF141F38.toInt(), 12f, this@MainActivity, 0xFF253659.toInt(), 1f)
                val p = UiKit.rdp(this@MainActivity, 9)
                setPadding(p, p, p, p)
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                    leftMargin = UiKit.rdp(this@MainActivity, 5)
                }
            }
            rightTile.addView(UiKit.text(this, "TODAY NUTRITION", 9.5f, 0xFFFDBA74.toInt(), bold = true))
            rightTile.addView(UiKit.text(this, "${snap.todayCalories} / ${snap.targetCalories}", 12.5f, 0xFFFFFFFF.toInt(), bold = true, tabular = true))
            rightTile.addView(UiKit.progressBar(this, kcalPct / 100f, 0xFFF97316.toInt()))
            rightTile.addView(UiKit.text(this, "Protein ${snap.todayProteinG}/${snap.targetProteinG}g", 9.5f, 0xFF94A3B8.toInt(), tabular = true))

            pvCols.addView(leftTile)
            pvCols.addView(rightTile)
            previewShell.addView(pvCols)

            // 2x2 Mesocycle Split Set Progress Bars Grid Preview
            if (snap.mesoSplitBars.size >= 4) {
                previewShell.addView(UiKit.spacerV(this, 6))
                val splitColors = intArrayOf(
                    0xFF3B82F6.toInt(),
                    0xFF10B981.toInt(),
                    0xFF38BDF8.toInt(),
                    0xFFF97316.toInt()
                )
                val splitWrap = LinearLayout(this).apply {
                    orientation = LinearLayout.VERTICAL
                    background = UiKit.roundedBg(0xFF141F38.toInt(), 12f, this@MainActivity, 0xFF253659.toInt(), 1f)
                    val p = UiKit.rdp(this@MainActivity, 8)
                    setPadding(p, p, p, p)
                }
                for (rowIdx in 0..1) {
                    val r = LinearLayout(this).apply {
                        orientation = LinearLayout.HORIZONTAL
                        if (rowIdx == 0) {
                            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                                bottomMargin = UiKit.rdp(this@MainActivity, 4)
                            }
                        }
                    }
                    for (colIdx in 0..1) {
                        val bIdx = rowIdx * 2 + colIdx
                        val bar = snap.mesoSplitBars[bIdx]
                        val cell = LinearLayout(this).apply {
                            orientation = LinearLayout.VERTICAL
                            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                                if (colIdx == 0) rightMargin = UiKit.rdp(this@MainActivity, 5)
                                else leftMargin = UiKit.rdp(this@MainActivity, 5)
                            }
                        }
                        val title = if (effectiveTier == "expanded") "${bar.fullTitle} · ${bar.completedSets}/${bar.plannedSets}" else "${bar.shortTitle} ${bar.completedSets}/${bar.plannedSets}"
                        cell.addView(UiKit.text(this, title, 9.5f, 0xFFE2E8F0.toInt(), bold = true, tabular = true))
                        cell.addView(UiKit.progressBar(this, bar.progressPct / 100f, splitColors[bIdx]))
                        r.addView(cell)
                    }
                    splitWrap.addView(r)
                }
                previewShell.addView(splitWrap)
            }
        }
        widgetCard.addView(previewShell)
        widgetCard.addView(UiKit.spacerV(this, 6))

        val prefs = getSharedPreferences("hyperlog_prefs", Context.MODE_PRIVATE)
        val lastTriggerRaw = prefs.getString("lastWidgetTrigger", "data_sync") ?: "data_sync"
        val triggerReadable = when (lastTriggerRaw) {
            HyperLogStreakWidgetProvider.SOURCE_SET_COMPLETED -> "Set Completed in Tracker"
            HyperLogStreakWidgetProvider.SOURCE_MEAL_SAVED -> "Meal Saved in Calories"
            else -> "Live SQLite Sync"
        }
        widgetCard.addView(UiKit.text(
            this,
            "Real-time AppWidgetManager sync active · Last trigger: $triggerReadable",
            11f,
            UiKit.COL_TEXT_MUTED,
            tabular = true
        ))
        widgetCard.addView(UiKit.spacerV(this, 8))

        val wBtnRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        wBtnRow.addView(UiKit.primaryButton(this, "+ Pin Widget to Home Screen", UiKit.COL_ACCENT) {
            val pinned = HyperLogStreakWidgetProvider.requestPinToHomeScreen(this)
            HyperLogStreakWidgetProvider.refreshAllWidgets(this)
            if (pinned) {
                showBanner("Confirm the Android prompt to place your HyperLog widget!")
            } else {
                showBanner("Long-press your Android Home Screen → Widgets → HyperLog to place!")
            }
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1.3f).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 6)
            }
        })
        wBtnRow.addView(UiKit.outlineButton(this, "Sync Widget") {
            HyperLogStreakWidgetProvider.refreshAllWidgets(this)
            if (hapticEnabled) NativeHardwareBridge.hapticTick(this)
            showBanner("Home screen widget synced with latest SQLite progress!")
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 0.7f)
        })
        widgetCard.addView(wBtnRow)
        pageContent.addView(widgetCard)

        // 2. APPEARANCE & NIGHT THEMES
        val themeCard = UiKit.card(this, padDp = 14)
        themeCard.addView(UiKit.text(this, "Appearance & Night Themes", 15.5f, UiKit.COL_TEXT_DARK, bold = true))
        themeCard.addView(UiKit.text(this, "Automatically syncs status bar & gesture navigation bar icons", 11.5f, UiKit.COL_TEXT_MUTED))
        themeCard.addView(UiKit.spacerV(this, 8))

        AppThemeMode.entries.forEach { mode ->
            val active = UiKit.themeMode == mode
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                background = UiKit.roundedBg(
                    if (active) UiKit.COL_SUBTLE else UiKit.COL_CARD,
                    11f,
                    this@MainActivity,
                    if (active) UiKit.COL_ACCENT else UiKit.COL_BORDER,
                    if (active) 1.5f else 1f
                )
                val px = UiKit.rdp(this@MainActivity, 12)
                val py = UiKit.rdp(this@MainActivity, 10)
                setPadding(px, py, px, py)
                layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                    bottomMargin = UiKit.rdp(this@MainActivity, 7)
                }
                setOnClickListener {
                    UiKit.themeMode = mode
                    savePrefs()
                    if (hapticEnabled) NativeHardwareBridge.hapticTick(this@MainActivity)
                    refreshShellTheme()
                }
            }
            val left = LinearLayout(this).apply {
                orientation = LinearLayout.VERTICAL
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            }
            left.addView(UiKit.text(this, mode.label, 14f, UiKit.COL_TEXT_DARK, bold = true))
            left.addView(UiKit.text(this, mode.subtitle, 11.5f, UiKit.COL_TEXT_MUTED))
            row.addView(left)
            row.addView(UiKit.text(
                this,
                if (active) "Active ✓" else "Select",
                12f,
                if (active) UiKit.COL_ACCENT else UiKit.COL_TEXT_MUTED,
                bold = true
            ))
            themeCard.addView(row)
        }
        pageContent.addView(themeCard)

        // 3. TRAINING, UNITS, HAPTICS & PHONE SCREEN ADAPTATION
        val prefCard = UiKit.card(this, padDp = 14)
        prefCard.addView(UiKit.text(this, "Training, Units & Device Hardware", 15.5f, UiKit.COL_TEXT_DARK, bold = true))
        prefCard.addView(UiKit.spacerV(this, 8))

        // Weight Unit Row
        val unitRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        unitRow.addView(UiKit.text(this, "Barbell & Bodyweight Unit", 13f, UiKit.COL_TEXT_DARK, bold = true).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        listOf("kg", "lb").forEachIndexed { idx, u ->
            unitRow.addView(UiKit.chip(this, u.uppercase(), weightUnit == u) {
                weightUnit = u
                savePrefs()
                renderActivePage()
            })
            if (idx == 0) unitRow.addView(UiKit.spacerH(this, 6))
        }
        prefCard.addView(unitRow)
        prefCard.addView(UiKit.spacerV(this, 10))

        // Default Rest Timer Duration
        prefCard.addView(UiKit.text(this, "Default Rest Timer (${customRestDurationSec}s)", 13f, UiKit.COL_TEXT_DARK, bold = true))
        prefCard.addView(UiKit.spacerV(this, 5))
        val (restScroll, restRow) = UiKit.hScrollRow(this)
        listOf(60, 90, 120, 180).forEach { sec ->
            restRow.addView(UiKit.chip(this, "${sec}s", customRestDurationSec == sec) {
                setPresetRestSeconds(sec)
            })
            restRow.addView(UiKit.spacerH(this, 6))
        }
        restRow.addView(UiKit.outlineButton(this, "Custom Sec", UiKit.COL_ACCENT) {
            showCustomRestSecondsDialog()
        })
        prefCard.addView(restScroll)
        prefCard.addView(UiKit.spacerV(this, 10))

        // Native Vibration Motor Switch
        val vibRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val motorStatus = if (NativeHardwareBridge.hasVibrator(this)) "Native Motor Ready" else "Simulated"
        val vibCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        vibCol.addView(UiKit.text(this, "Vibration Rest Alarm", 13f, UiKit.COL_TEXT_DARK, bold = true))
        vibCol.addView(UiKit.text(this, "Triple-pulse vibration when rest ends ($motorStatus)", 11.5f, UiKit.COL_TEXT_MUTED))
        vibRow.addView(vibCol)
        vibRow.addView(UiKit.outlineButton(this, "Test") {
            NativeHardwareBridge.hapticRestComplete(this)
            showBanner("Triggered native vibration motor test pulse!")
        })
        vibRow.addView(UiKit.spacerH(this, 6))
        vibRow.addView(Switch(this).apply {
            isChecked = hapticEnabled
            setOnCheckedChangeListener { _, checked ->
                hapticEnabled = checked
                savePrefs()
                if (checked) NativeHardwareBridge.hapticTick(this@MainActivity)
            }
        })
        prefCard.addView(vibRow)
        prefCard.addView(UiKit.spacerV(this, 10))

        // Keep Screen Awake Switch
        val wakeRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        val wakeCol = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        wakeCol.addView(UiKit.text(this, "Keep Gym Screen Awake", 13f, UiKit.COL_TEXT_DARK, bold = true))
        wakeCol.addView(UiKit.text(this, "Prevents screen timeout during active set logging", 11.5f, UiKit.COL_TEXT_MUTED))
        wakeRow.addView(wakeCol)
        wakeRow.addView(Switch(this).apply {
            isChecked = keepScreenOn
            setOnCheckedChangeListener { _, checked ->
                keepScreenOn = checked
                savePrefs()
                NativeHardwareBridge.setKeepScreenOn(this@MainActivity, checked)
            }
        })
        prefCard.addView(wakeRow)
        prefCard.addView(UiKit.spacerV(this, 10))

        // Auto-Detected Phone Screen Adaptation Info
        val sw = UiKit.screenWidthDp(this)
        val sh = UiKit.screenHeightDp(this)
        val dpi = resources.displayMetrics.densityDpi
        val profileTag = when {
            sw < 360 -> "Compact Android Phone"
            sw < 412 -> "Standard Android Phone"
            else -> "Expanded / Large Android Phone"
        }
        prefCard.addView(UiKit.text(
            this,
            "Auto-Detected Screen: ${sw}dp × ${sh}dp · ${dpi}dpi ($profileTag · Safe Cutout/Gesture Insets Active)",
            11f,
            UiKit.COL_TEXT_MUTED,
            tabular = true
        ))
        pageContent.addView(prefCard)

        // 4. OFFLINE BACKUP, HEALTH CONNECT & FACTORY RESET
        val dataCard = UiKit.card(this, padDp = 14)
        dataCard.addView(UiKit.text(this, "Offline SQLite Backup & Data Management", 15.5f, UiKit.COL_TEXT_DARK, bold = true))
        val hcPresent = NativeHardwareBridge.isHealthConnectInstalled(this)
        dataCard.addView(UiKit.text(
            this,
            if (hcPresent) "All workouts, landmarks, and meals live 100% offline in on-device SQLite. Health Connect is available."
            else "All workouts, landmarks, and meals live 100% offline in on-device SQLite.",
            11.5f,
            UiKit.COL_TEXT_MUTED
        ))
        dataCard.addView(UiKit.spacerV(this, 10))

        val bRow = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        bRow.addView(UiKit.primaryButton(this, "Export .JSON Backup", UiKit.COL_ACCENT) {
            triggerExportJson()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                rightMargin = UiKit.rdp(this@MainActivity, 6)
            }
        })
        bRow.addView(UiKit.outlineButton(this, "Import .JSON Backup") {
            triggerImportJson()
        }.apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        })
        dataCard.addView(bRow)
        dataCard.addView(UiKit.spacerV(this, 8))

        dataCard.addView(UiKit.outlineButton(this, "Open Android Health Connect Settings", UiKit.COL_ACCENT) {
            showBanner(NativeHardwareBridge.openHealthConnectOrReportOffline(this, "HyperLog Sync Settings"))
        })
        dataCard.addView(UiKit.spacerV(this, 8))

        dataCard.addView(UiKit.outlineButton(this, "Reset App Data to Factory Seed", 0xFFEF4444.toInt()) {
            AlertDialog.Builder(this, UiKit.dialogTheme())
                .setTitle("Reset Offline SQLite Database?")
                .setMessage("This will restore default hypertrophy landmarks, starter templates, and sample logs. Export a JSON backup first if you want to keep your custom logs.")
                .setPositiveButton("Reset Data") { _, _ ->
                    db.resetToDefaults()
                    HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                    showBanner("Reset offline SQLite database to factory defaults")
                    renderActivePage()
                }
                .setNegativeButton("Cancel", null)
                .show()
        })
        pageContent.addView(dataCard)
    }

    private fun triggerExportJson() {
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "application/json"
            putExtra(Intent.EXTRA_TITLE, "hyperlog-backup-${LocalDate.now()}.json")
        }
        try {
            startActivityForResult(intent, REQ_EXPORT_JSON)
        } catch (e: Exception) {
            showBanner("File picker unavailable: ${e.message}")
        }
    }

    private fun triggerImportJson() {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
        }
        try {
            startActivityForResult(intent, REQ_IMPORT_JSON)
        } catch (e: Exception) {
            showBanner("File picker unavailable: ${e.message}")
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (resultCode != RESULT_OK || data?.data == null) return
        val uri = data.data!!
        if (requestCode == REQ_EXPORT_JSON) {
            try {
                val json = db.exportFullJsonBackup()
                contentResolver.openOutputStream(uri)?.use { it.write(json.toByteArray(Charsets.UTF_8)) }
                showBanner("Saved offline JSON backup to device storage!")
            } catch (e: Exception) {
                showBanner("Export failed: ${e.message}")
            }
        } else if (requestCode == REQ_IMPORT_JSON) {
            try {
                val json = contentResolver.openInputStream(uri)?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
                if (!json.isNullOrBlank()) {
                    db.importFullJsonBackup(json)
                    HyperLogStreakWidgetProvider.refreshAllWidgets(this)
                    showBanner("Restored offline JSON backup into SQLite!")
                    renderActivePage()
                }
            } catch (e: Exception) {
                showBanner("Import failed: ${e.message}")
            }
        }
    }
}
