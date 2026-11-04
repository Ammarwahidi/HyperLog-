# HyperLog Standalone Android App — v4.0.0 (Build 18)

**Package ID:** `com.hyperlog.rp`  
**Version:** `4.0.0` (`versionCode = 18`)  
**Minimum Android:** Android 8.0 Oreo (`API 26`)  
**Target Android:** Android 15 (`API 35`)  
**Signing Schemes:** APK Signature Scheme `v1 (JAR)` + `v2` + `v3` (`4-byte zipaligned`, uncompressed `resources.arsc`)

---

## What's New in v4.0.0 (Build 18) — 100% Identical Web & Standalone Android UI/UX + 60 FPS Performance Optimization

1. **Pixel-Identical UI Across All 6 Pages (`Tracker`, `Anatomy`, `Workouts`, `Library`, `Wellness`, `Settings`)**
   - Bundles the compiled React + Tailwind CSS Web UI inside `assets/webapp/` served 100% offline via `https://app.hyperlog.local/` so every card, SVG muscle map, circular completion ring, `.hl-card` single-row layout, tactile pop animation, 3-set `Average` weight label, and modal looks and behaves identically to the Web App.
   - **Zero Preloaded Tracker Clutter**: Tapping **Start Today's Workout** opens a clean choice to either build a custom workout from scratch or pick any RP Hypertrophy split/specialized template.
   - Automatic build-time asset synchronization (`scripts/sync-android-webapp.mjs`) guarantees Web and Android never drift out of sync.

2. **Native Android OS Hardware & Home Screen Widget Bridge (`window.HyperLogNative`)**
   - **Live Home Screen Streak & Progress Widget (`HyperLogStreakWidgetProvider`)**: Automatically updates in real time whenever sets or meals are logged, plus 1-tap widget pinning from Settings.
   - **Android Health Connect Integration**: Direct `HealthConnectManager` permissions & `ExerciseSessionRecord` sync from Settings → Health Integration and workout completion.
   - **System Bars, Haptics, Wake-Lock & File Sharing**: Dynamic edge-to-edge status/navigation bar color matching across all 7 themes, native `VibrationEffect` haptics, active-workout `FLAG_KEEP_SCREEN_ON`, and native `HyperLogFileProvider` Share sheets for PDF, CSV, and JSON backups.

---

## Installation Instructions (Physical Android Phone)

1. Download **`HyperLog-v4.0-claymorphism-release.apk`** directly onto your Android phone (or extract **`HyperLog-v4.0-Phone-Install-Bundle.zip`**).
2. Open your phone's **Files** or **Downloads** app and tap `HyperLog-v4.0-claymorphism-release.apk`.
3. If Android prompts to allow installation from your browser/Files app, tap **Settings → Allow from this source**, then tap **Install** (or **Update**).
4. Tap **Open** to launch HyperLog v4.0.0 (Build 18) 100% offline.

