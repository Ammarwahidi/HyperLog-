package com.hyperlog.rp

import android.app.Activity
import android.os.Bundle
import android.widget.LinearLayout

class PermissionsRationaleActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val prefs = getSharedPreferences("hyperlog_prefs", MODE_PRIVATE)
        UiKit.themeMode = AppThemeMode.fromId(prefs.getString("themeMode", "light"))
        window.statusBarColor = UiKit.COL_CARD
        window.navigationBarColor = UiKit.COL_CARD
        val col = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(UiKit.COL_BG)
            val p = UiKit.dp(this@PermissionsRationaleActivity, 24)
            setPadding(p, p, p, p)
        }
        col.addView(UiKit.text(this, "HyperLog Offline Privacy & Health Connect Rationale", 18f, UiKit.COL_TEXT_DARK, bold = true))
        col.addView(UiKit.spacerV(this, 12))
        col.addView(UiKit.text(
            this,
            "HyperLog stores 100% of your workout logs, muscle landmarks, workout templates, exercise library, and nutrition records locally on your device inside an offline SQLite database. Zero cloud containers or remote servers are required.",
            14f, UiKit.COL_TEXT_MID
        ))
        col.addView(UiKit.spacerV(this, 12))
        col.addView(UiKit.text(
            this,
            "When Android Health Connect permissions are granted, HyperLog syncs completed weightlifting sessions, active calories, macro totals, and bodyweight with Google Fit on device.",
            14f, UiKit.COL_TEXT_MID
        ))
        col.addView(UiKit.spacerV(this, 20))
        col.addView(UiKit.primaryButton(this, "Close") { finish() })
        setContentView(col)
    }
}
