package com.hyperlog.rp

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.SizeF
import android.util.TypedValue
import android.widget.RemoteViews
import java.text.NumberFormat
import java.util.Locale
import kotlin.math.roundToInt

/**
 * Real-time, screen-responsive Android Home Screen AppWidgetProvider for HyperLog.
 *
 * Uses dynamic RemoteViews GridLayouts ([R.layout.widget_streak_progress_compact],
 * [R.layout.widget_streak_progress], and [R.layout.widget_streak_progress_expanded])
 * paired with phone display metrics scaling (`smallestScreenWidthDp`, `density`, `fontScale`)
 * and Android 12+ responsive `SizeF` mapping so both weekly mesocycle set progress bars
 * and the streak counter remain sharp and readable on compact and large displays alike.
 */
class HyperLogStreakWidgetProvider : AppWidgetProvider() {

    private enum class WidgetGridTier {
        COMPACT,
        STANDARD,
        EXPANDED
    }

    private data class PhoneDisplayScale(
        val smallestWidthDp: Int,
        val density: Float,
        val textScale: Float,
        val padScale: Float
    )

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        pushRealTimeWidgetUpdate(context, SOURCE_WIDGET_ENABLED)
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        val appCtx = context.applicationContext
        val snap = loadCurrentSnapshot(appCtx)
        if (appWidgetIds.isEmpty()) {
            val component = ComponentName(appCtx, HyperLogStreakWidgetProvider::class.java)
            appWidgetManager.updateAppWidget(component, buildResponsiveRemoteViews(appCtx, snap, null))
            return
        }
        for (widgetId in appWidgetIds) {
            val options = runCatching { appWidgetManager.getAppWidgetOptions(widgetId) }.getOrNull()
            val views = buildResponsiveRemoteViews(appCtx, snap, options)
            appWidgetManager.updateAppWidget(widgetId, views)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        val appCtx = context.applicationContext
        val snap = loadCurrentSnapshot(appCtx)
        val views = buildResponsiveRemoteViews(appCtx, snap, newOptions)
        appWidgetManager.updateAppWidget(appWidgetId, views)
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        when (intent.action) {
            ACTION_REFRESH_WIDGET,
            ACTION_WIDGET_SET_UPDATED,
            ACTION_WIDGET_MEAL_UPDATED,
            Intent.ACTION_CONFIGURATION_CHANGED,
            Intent.ACTION_DATE_CHANGED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED -> {
                if (!intent.getBooleanExtra(EXTRA_DIRECT_ALREADY_APPLIED, false)) {
                    val trigger = intent.getStringExtra(EXTRA_TRIGGER_SOURCE) ?: intent.action ?: SOURCE_BROADCAST
                    pushRealTimeWidgetUpdate(context, trigger)
                }
            }
        }
    }

    companion object {
        const val ACTION_REFRESH_WIDGET = "com.hyperlog.rp.ACTION_REFRESH_WIDGET"
        const val ACTION_WIDGET_SET_UPDATED = "com.hyperlog.rp.ACTION_WIDGET_SET_UPDATED"
        const val ACTION_WIDGET_MEAL_UPDATED = "com.hyperlog.rp.ACTION_WIDGET_MEAL_UPDATED"

        const val EXTRA_TARGET_TAB = "target_tab"
        const val EXTRA_TRIGGER_SOURCE = "trigger_source"
        private const val EXTRA_DIRECT_ALREADY_APPLIED = "direct_already_applied"

        const val SOURCE_SET_COMPLETED = "set_completed"
        const val SOURCE_MEAL_SAVED = "meal_saved"
        const val SOURCE_DATA_SYNC = "data_sync"
        private const val SOURCE_WIDGET_ENABLED = "widget_enabled"
        private const val SOURCE_BROADCAST = "broadcast_refresh"

        /**
         * Triggered immediately whenever a user completes or modifies a set in the Tracker.
         * Invokes [AppWidgetManager.updateAppWidget] synchronously for zero-latency launcher refresh
         * and emits an explicit foreground package broadcast for OEM widget hosts.
         */
        fun onSetCompleted(context: Context) {
            pushRealTimeWidgetUpdate(context, SOURCE_SET_COMPLETED)
            dispatchExplicitWidgetBroadcast(context, ACTION_WIDGET_SET_UPDATED, SOURCE_SET_COMPLETED)
        }

        /**
         * Triggered immediately whenever a user saves a meal, logs a preset, or removes a meal.
         * Invokes [AppWidgetManager.updateAppWidget] synchronously for zero-latency launcher refresh
         * and emits an explicit foreground package broadcast for OEM widget hosts.
         */
        fun onMealSaved(context: Context) {
            pushRealTimeWidgetUpdate(context, SOURCE_MEAL_SAVED)
            dispatchExplicitWidgetBroadcast(context, ACTION_WIDGET_MEAL_UPDATED, SOURCE_MEAL_SAVED)
        }

        /**
         * Refreshes all placed Home Screen widgets from live SQLite state.
         */
        fun refreshAllWidgets(context: Context) {
            pushRealTimeWidgetUpdate(context, SOURCE_DATA_SYNC)
            dispatchExplicitWidgetBroadcast(context, ACTION_REFRESH_WIDGET, SOURCE_DATA_SYNC)
        }

        private fun loadCurrentSnapshot(appCtx: Context): WidgetProgressSnapshot {
            val prefs = appCtx.getSharedPreferences("hyperlog_prefs", Context.MODE_PRIVATE)
            val activeWeek = prefs.getInt("activeWeek", 3)
            val db = HyperLogDatabase.getInstance(appCtx)
            return db.getWidgetProgressSnapshot(activeWeek)
        }

        private fun pushRealTimeWidgetUpdate(context: Context, triggerSource: String) {
            try {
                val appCtx = context.applicationContext
                val prefs = appCtx.getSharedPreferences("hyperlog_prefs", Context.MODE_PRIVATE)
                prefs.edit()
                    .putLong("lastWidgetSyncEpochMs", System.currentTimeMillis())
                    .putString("lastWidgetTrigger", triggerSource)
                    .apply()

                val appWidgetManager = AppWidgetManager.getInstance(appCtx) ?: return
                val component = ComponentName(appCtx, HyperLogStreakWidgetProvider::class.java)
                val snap = loadCurrentSnapshot(appCtx)
                val ids = appWidgetManager.getAppWidgetIds(component)

                if (ids != null && ids.isNotEmpty()) {
                    for (widgetId in ids) {
                        val options = runCatching { appWidgetManager.getAppWidgetOptions(widgetId) }.getOrNull()
                        val views = buildResponsiveRemoteViews(appCtx, snap, options)
                        appWidgetManager.updateAppWidget(widgetId, views)
                    }
                } else {
                    val defaultViews = buildResponsiveRemoteViews(appCtx, snap, null)
                    appWidgetManager.updateAppWidget(component, defaultViews)
                }
            } catch (_: Exception) {
                // Safeguard if launcher AppWidgetService is unavailable on restricted ROMs
            }
        }

        private fun dispatchExplicitWidgetBroadcast(
            context: Context,
            actionName: String,
            triggerSource: String
        ) {
            try {
                val appCtx = context.applicationContext
                val appWidgetManager = AppWidgetManager.getInstance(appCtx) ?: return
                val component = ComponentName(appCtx, HyperLogStreakWidgetProvider::class.java)
                val ids = appWidgetManager.getAppWidgetIds(component)
                if (ids == null || ids.isEmpty()) return

                val broadcastIntent = Intent(appCtx, HyperLogStreakWidgetProvider::class.java).apply {
                    action = actionName
                    putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
                    putExtra(EXTRA_TRIGGER_SOURCE, triggerSource)
                    putExtra(EXTRA_DIRECT_ALREADY_APPLIED, true)
                    addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
                }
                appCtx.sendBroadcast(broadcastIntent)
            } catch (_: Exception) {
                // Ignore broadcast dispatch errors
            }
        }

        fun canRequestPinWidget(context: Context): Boolean {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val mgr = AppWidgetManager.getInstance(context)
                    mgr.isRequestPinAppWidgetSupported
                } else {
                    false
                }
            } catch (_: Exception) {
                false
            }
        }

        fun requestPinToHomeScreen(context: Context): Boolean {
            return try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val mgr = AppWidgetManager.getInstance(context)
                    if (mgr.isRequestPinAppWidgetSupported) {
                        val provider = ComponentName(context, HyperLogStreakWidgetProvider::class.java)
                        mgr.requestPinAppWidget(provider, null, null)
                    } else {
                        false
                    }
                } else {
                    false
                }
            } catch (_: Exception) {
                false
            }
        }

        private fun buildTabPendingIntent(context: Context, reqCode: Int, tabKey: String): PendingIntent {
            val launchIntent = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra(EXTRA_TARGET_TAB, tabKey)
            }
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            return PendingIntent.getActivity(context, reqCode, launchIntent, flags)
        }

        fun updateSingleWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int
        ) {
            val appCtx = context.applicationContext
            val snap = loadCurrentSnapshot(appCtx)
            val options = runCatching { appWidgetManager.getAppWidgetOptions(appWidgetId) }.getOrNull()
            val views = buildResponsiveRemoteViews(appCtx, snap, options)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }

        private fun computePhoneDisplayScale(context: Context): PhoneDisplayScale {
            val cfg = context.resources.configuration
            val dm = context.resources.displayMetrics
            val rawSw = if (cfg.smallestScreenWidthDp > 0) {
                cfg.smallestScreenWidthDp
            } else {
                (dm.widthPixels / dm.density.coerceAtLeast(1f)).roundToInt()
            }
            val rawScale = when {
                rawSw < 335 -> 0.88f
                rawSw < 360 -> 0.94f
                rawSw < 411 -> 1.00f
                rawSw < 480 -> 1.06f
                else -> 1.12f
            }
            // Dampen extreme OS font magnification so RemoteViews grid cells never clip
            val fontScale = cfg.fontScale.coerceIn(0.85f, 1.45f)
            val fontCompensation = if (fontScale > 1.15f) (1.15f / fontScale) else 1.0f
            val finalTextScale = (rawScale * fontCompensation).coerceIn(0.82f, 1.14f)
            val padScale = rawScale.coerceIn(0.85f, 1.15f)
            return PhoneDisplayScale(
                smallestWidthDp = rawSw,
                density = dm.density.coerceAtLeast(1f),
                textScale = finalTextScale,
                padScale = padScale
            )
        }

        private fun resolveGridTier(
            options: Bundle?,
            displayScale: PhoneDisplayScale
        ): WidgetGridTier {
            val defaultWidth = if (displayScale.smallestWidthDp < 350) 210 else 260
            val minWidthDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, defaultWidth)
                ?.takeIf { it > 0 } ?: defaultWidth
            val minHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 118)
                ?.takeIf { it > 0 } ?: 118
            val maxHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeightDp)
                ?.takeIf { it > 0 } ?: minHeightDp

            return when {
                minWidthDp < 220 || (displayScale.smallestWidthDp < 340 && minWidthDp < 245) ->
                    WidgetGridTier.COMPACT
                minHeightDp >= 165 || (minWidthDp >= 295 && maxHeightDp >= 160) ->
                    WidgetGridTier.EXPANDED
                else -> WidgetGridTier.STANDARD
            }
        }

        private fun buildResponsiveRemoteViews(
            context: Context,
            snap: WidgetProgressSnapshot,
            options: Bundle?
        ): RemoteViews {
            val scale = computePhoneDisplayScale(context)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                return try {
                    val compactViews = buildTierRemoteViews(context, snap, WidgetGridTier.COMPACT, scale)
                    val standardViews = buildTierRemoteViews(context, snap, WidgetGridTier.STANDARD, scale)
                    val expandedViews = buildTierRemoteViews(context, snap, WidgetGridTier.EXPANDED, scale)
                    val sizeMap = mapOf(
                        SizeF(140f, 96f) to compactViews,
                        SizeF(225f, 110f) to standardViews,
                        SizeF(275f, 170f) to expandedViews
                    )
                    RemoteViews(sizeMap)
                } catch (_: Exception) {
                    val fallbackTier = resolveGridTier(options, scale)
                    buildTierRemoteViews(context, snap, fallbackTier, scale)
                }
            }

            val tier = resolveGridTier(options, scale)
            return buildTierRemoteViews(context, snap, tier, scale)
        }

        private fun buildTierRemoteViews(
            context: Context,
            snap: WidgetProgressSnapshot,
            tier: WidgetGridTier,
            scale: PhoneDisplayScale
        ): RemoteViews {
            val layoutId = when (tier) {
                WidgetGridTier.COMPACT -> R.layout.widget_streak_progress_compact
                WidgetGridTier.STANDARD -> R.layout.widget_streak_progress
                WidgetGridTier.EXPANDED -> R.layout.widget_streak_progress_expanded
            }
            val views = RemoteViews(context.packageName, layoutId)
            val nf = NumberFormat.getIntegerInstance(Locale.US)

            fun scaledSp(id: Int, baseSp: Float) {
                views.setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_SP, baseSp * scale.textScale)
            }

            // Dynamic root padding scaled to phone screen size
            val basePadDp = when (tier) {
                WidgetGridTier.COMPACT -> 8.5f
                WidgetGridTier.STANDARD -> 10.5f
                WidgetGridTier.EXPANDED -> 12.5f
            }
            val rootPadPx = (basePadDp * scale.padScale * scale.density).roundToInt()
            views.setViewPadding(R.id.widget_root, rootPadPx, rootPadPx, rootPadPx, rootPadPx)

            // 1. Header & Readable Streak Count
            when (tier) {
                WidgetGridTier.COMPACT -> {
                    views.setTextViewText(R.id.widget_title, "HyperLog")
                    views.setTextViewText(R.id.widget_subtitle, "Wk ${snap.activeWeek} · Best ${snap.bestStreakDays}d")
                    views.setTextViewText(R.id.widget_streak_text, "🔥 ${snap.streakDays}d")
                    scaledSp(R.id.widget_title, 12f)
                    scaledSp(R.id.widget_subtitle, 9.5f)
                    scaledSp(R.id.widget_streak_text, 11.5f)
                }
                WidgetGridTier.STANDARD -> {
                    views.setTextViewText(R.id.widget_title, "HyperLog")
                    views.setTextViewText(R.id.widget_subtitle, "${snap.weekSubtitle} · Best ${snap.bestStreakDays}d")
                    val streakTxt = if (snap.streakDays == 1) "🔥 1d Streak" else "🔥 ${snap.streakDays}d Streak"
                    views.setTextViewText(R.id.widget_streak_text, streakTxt)
                    scaledSp(R.id.widget_title, 13f)
                    scaledSp(R.id.widget_subtitle, 10f)
                    scaledSp(R.id.widget_streak_text, 11.5f)
                }
                WidgetGridTier.EXPANDED -> {
                    views.setTextViewText(R.id.widget_title, "HyperLog · Mesocycle")
                    views.setTextViewText(
                        R.id.widget_subtitle,
                        "${snap.weekSubtitle} · Best Streak ${snap.bestStreakDays}d"
                    )
                    val streakTxt = if (snap.streakDays == 1) "🔥 1d Streak" else "🔥 ${snap.streakDays}d Streak"
                    views.setTextViewText(R.id.widget_streak_text, streakTxt)
                    scaledSp(R.id.widget_title, 14f)
                    scaledSp(R.id.widget_subtitle, 10.5f)
                    scaledSp(R.id.widget_streak_text, 12.5f)
                }
            }

            // 2. 7-Day Consistency RemoteViews GridLayout
            val dayViewIds = intArrayOf(
                R.id.widget_day_0,
                R.id.widget_day_1,
                R.id.widget_day_2,
                R.id.widget_day_3,
                R.id.widget_day_4,
                R.id.widget_day_5,
                R.id.widget_day_6
            )
            val baseDaySp = when (tier) {
                WidgetGridTier.COMPACT -> 8.8f
                WidgetGridTier.STANDARD -> 9.3f
                WidgetGridTier.EXPANDED -> 10.2f
            }
            snap.last7Days.forEachIndexed { idx, (dayChar, isActive) ->
                if (idx < dayViewIds.size) {
                    val viewId = dayViewIds[idx]
                    val isToday = idx == snap.last7Days.lastIndex
                    val dayText = if (tier == WidgetGridTier.COMPACT) {
                        if (isActive) "$dayChar✓" else dayChar
                    } else {
                        val dot = if (isActive) "●" else "○"
                        "$dayChar $dot"
                    }
                    views.setTextViewText(viewId, dayText)
                    scaledSp(viewId, baseDaySp)
                    val textColor = when {
                        isActive && isToday -> 0xFFFDBA74.toInt()
                        isActive -> 0xFFBAE6FD.toInt()
                        else -> 0xFF64748B.toInt()
                    }
                    val bgRes = when {
                        isActive && isToday -> R.drawable.widget_day_cell_today
                        isActive -> R.drawable.widget_day_cell_active
                        else -> R.drawable.widget_day_cell_idle
                    }
                    views.setTextColor(viewId, textColor)
                    views.setInt(viewId, "setBackgroundResource", bgRes)
                }
            }

            // 3. Primary Weekly Mesocycle Sets Progress Bar
            val setsPct = ((snap.completedSets * 100.0) / snap.plannedSets.coerceAtLeast(1).toDouble())
                .roundToInt()
                .coerceIn(0, 100)
            views.setProgressBar(R.id.widget_sets_progress, 100, setsPct, false)

            // 4. Daily Calories & Protein Progress Bars
            val kcalPct = ((snap.todayCalories * 100.0) / snap.targetCalories.coerceAtLeast(1).toDouble())
                .roundToInt()
                .coerceIn(0, 100)
            val proteinPct = ((snap.todayProteinG * 100.0) / snap.targetProteinG.coerceAtLeast(1).toDouble())
                .roundToInt()
                .coerceIn(0, 100)
            views.setProgressBar(R.id.widget_kcal_progress, 100, kcalPct, false)

            when (tier) {
                WidgetGridTier.COMPACT -> {
                    views.setTextViewText(R.id.widget_sets_label, "WK ${snap.activeWeek} SETS")
                    views.setTextViewText(R.id.widget_sets_value, "${snap.completedSets}/${snap.plannedSets} sets")
                    views.setTextViewText(R.id.widget_sets_meta, "$setsPct% done · Tap to Track →")
                    scaledSp(R.id.widget_sets_label, 8.8f)
                    scaledSp(R.id.widget_sets_value, 10.8f)
                    scaledSp(R.id.widget_sets_meta, 8.5f)

                    views.setTextViewText(R.id.widget_kcal_label, "NUTRITION")
                    views.setTextViewText(
                        R.id.widget_kcal_value,
                        "${nf.format(snap.todayCalories)}/${nf.format(snap.targetCalories)}"
                    )
                    views.setTextViewText(
                        R.id.widget_kcal_meta,
                        "P ${snap.todayProteinG}/${snap.targetProteinG}g · Tap Meals →"
                    )
                    scaledSp(R.id.widget_kcal_label, 8.8f)
                    scaledSp(R.id.widget_kcal_value, 10.8f)
                    scaledSp(R.id.widget_kcal_meta, 8.5f)
                }

                WidgetGridTier.STANDARD -> {
                    views.setTextViewText(R.id.widget_sets_label, "WEEKLY MESO SETS")
                    views.setTextViewText(R.id.widget_sets_value, "${snap.completedSets} / ${snap.plannedSets} sets")
                    views.setTextViewText(R.id.widget_sets_meta, "$setsPct% of Wk ${snap.activeWeek} · Log Sets →")
                    scaledSp(R.id.widget_sets_label, 9f)
                    scaledSp(R.id.widget_sets_value, 12.2f)
                    scaledSp(R.id.widget_sets_meta, 8.8f)

                    views.setTextViewText(R.id.widget_kcal_label, "TODAY NUTRITION")
                    views.setTextViewText(
                        R.id.widget_kcal_value,
                        "${nf.format(snap.todayCalories)} / ${nf.format(snap.targetCalories)}"
                    )
                    views.setTextViewText(
                        R.id.widget_protein_label,
                        "Protein ${snap.todayProteinG} / ${snap.targetProteinG}g"
                    )
                    views.setProgressBar(R.id.widget_protein_progress, 100, proteinPct, false)
                    views.setTextViewText(R.id.widget_kcal_meta, "$kcalPct% kcal · Log Meals →")
                    scaledSp(R.id.widget_kcal_label, 9f)
                    scaledSp(R.id.widget_kcal_value, 12.2f)
                    scaledSp(R.id.widget_protein_label, 8.8f)
                    scaledSp(R.id.widget_kcal_meta, 8.8f)

                    bindMesocycleSplitGrid(views, snap, compactLabels = true, baseSp = 8.4f, scale = scale)
                }

                WidgetGridTier.EXPANDED -> {
                    views.setTextViewText(R.id.widget_sets_label, "TOTAL MESOCYCLE SETS")
                    views.setTextViewText(R.id.widget_sets_value, "${snap.completedSets} / ${snap.plannedSets} sets")
                    views.setTextViewText(R.id.widget_sets_meta, "$setsPct% of Week ${snap.activeWeek} · Track →")
                    scaledSp(R.id.widget_sets_label, 9.5f)
                    scaledSp(R.id.widget_sets_value, 13.5f)
                    scaledSp(R.id.widget_sets_meta, 9.2f)

                    views.setTextViewText(R.id.widget_kcal_label, "TODAY NUTRITION")
                    views.setTextViewText(
                        R.id.widget_kcal_value,
                        "${nf.format(snap.todayCalories)} / ${nf.format(snap.targetCalories)} kcal"
                    )
                    views.setTextViewText(
                        R.id.widget_kcal_meta,
                        "Protein ${snap.todayProteinG}/${snap.targetProteinG}g ($proteinPct%) · Meals →"
                    )
                    scaledSp(R.id.widget_kcal_label, 9.5f)
                    scaledSp(R.id.widget_kcal_value, 13.5f)
                    scaledSp(R.id.widget_kcal_meta, 9.2f)

                    bindMesocycleSplitGrid(views, snap, compactLabels = false, baseSp = 9.8f, scale = scale)
                }
            }

            // 5. Deep-link PendingIntents into MainActivity tabs
            views.setOnClickPendingIntent(R.id.widget_header_row, buildTabPendingIntent(context, 101, "anatomy"))
            views.setOnClickPendingIntent(R.id.widget_streak_badge, buildTabPendingIntent(context, 105, "settings"))
            views.setOnClickPendingIntent(R.id.widget_days_grid, buildTabPendingIntent(context, 102, "settings"))
            views.setOnClickPendingIntent(R.id.widget_col_training, buildTabPendingIntent(context, 103, "track"))
            views.setOnClickPendingIntent(R.id.widget_col_calories, buildTabPendingIntent(context, 104, "calories"))
            if (tier == WidgetGridTier.EXPANDED) {
                views.setOnClickPendingIntent(R.id.widget_meso_bars_grid, buildTabPendingIntent(context, 106, "track"))
            }

            return views
        }

        private fun bindMesocycleSplitGrid(
            views: RemoteViews,
            snap: WidgetProgressSnapshot,
            compactLabels: Boolean,
            baseSp: Float,
            scale: PhoneDisplayScale
        ) {
            val labelIds = intArrayOf(
                R.id.widget_split_0_label,
                R.id.widget_split_1_label,
                R.id.widget_split_2_label,
                R.id.widget_split_3_label
            )
            val progressIds = intArrayOf(
                R.id.widget_split_0_progress,
                R.id.widget_split_1_progress,
                R.id.widget_split_2_progress,
                R.id.widget_split_3_progress
            )
            snap.mesoSplitBars.forEachIndexed { idx, bar ->
                if (idx < labelIds.size) {
                    val labelText = if (compactLabels) {
                        "${bar.shortTitle} ${bar.completedSets}/${bar.plannedSets}"
                    } else {
                        "${bar.fullTitle} · ${bar.completedSets}/${bar.plannedSets} sets"
                    }
                    views.setTextViewText(labelIds[idx], labelText)
                    views.setTextViewTextSize(
                        labelIds[idx],
                        TypedValue.COMPLEX_UNIT_SP,
                        baseSp * scale.textScale
                    )
                    views.setProgressBar(progressIds[idx], 100, bar.progressPct, false)
                }
            }
        }
    }
}
