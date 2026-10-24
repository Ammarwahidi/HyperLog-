# HyperLog — Universal Android UI, Settings Hub, Home Screen Streak Widget, Offline Calorie Calculator & Vibrant Icon

This upgrade eliminates Android status-bar, camera-cutout, and gesture-bar collisions across all phone sizes, moves all app configuration into a dedicated Settings tab, adds a **native Android Home Screen Progress & Streak Widget**, introduces a vibrant electric-blue and fiery-orange dumbbell crest launcher icon, and overhauls the Calories tab with a 100% offline BMR/TDEE calculator and auto-calculating custom meal builder—delivered as a freshly tested, signed universal Android `.apk`.

### User Review & Critical Decisions

> [!IMPORTANT]
> Your request for a **Home Screen Progress & Streak Widget** has been integrated alongside all four previously confirmed choices. Please review the updated plan below and click **Proceed** to build, test, and package the updated Android `.apk`.

- **Confirmed Decision 1 — Native Home Screen Progress & Streak Widget**: Include a resizable Android home screen widget (`4×2` standard with compact scaling down to `2×2`) displaying your **live consecutive-day streak**, **weekly training set completion bar**, **today's calorie & protein progress**, and **1-tap quick launch** into HyperLog—plus a live interactive Widget Preview and **Add to Home Screen** button inside the Settings tab.
- **Confirmed Decision 2 — Navigation & Settings Tab**: Keep the 5 core bottom navigation tabs (*Anatomy, Track, Workouts, Library, Calories*) evenly spaced with safe horizontal margins, and place a dedicated **Settings** tab button in the top-right header bar where Theme, Widget Pinning, Backup/Restore, Units, Timer/Haptics, and App Reset live together cleanly.
- **Confirmed Decision 3 — Offline Calorie & Macro Calculator**: Compute daily BMR, TDEE, and hypertrophy macro targets completely offline using **weight, height, age, sex, activity level, and goal** (Mifflin-St Jeor equation + hypertrophy protein/fat/carb allocation) with one-tap **Apply to Daily Targets**.
- **Confirmed Decision 4 — Offline Custom Meal Builder**: Provide a redesigned meal builder combining an **offline searchable food library** (gram/serving portions that auto-compute macros) plus **direct custom macro inputs** that dynamically auto-calculate calories (`4 × Protein + 4 × Carbs + 9 × Fat`) offline in real time.
- **Confirmed Decision 5 — Lively App Icon**: Generate and package a **vibrant electric-blue and fiery-orange dumbbell crest** as an Android adaptive launcher icon (foreground + background layers + all screen-density bitmaps) and matching web/PWA icons.
- **Default Choice — Automatic Portrait Phone Scaling**: On compact phones (`< 380dp` width), the Anatomy view defaults to an easy single-plane **Anterior / Posterior** toggle (while keeping side-by-side Dual View optional on wider screens) so muscle diagrams are large, legible, and easy to tap with one thumb.

---

### 1. Overview & Core Concept

- **What It Does**: HyperLog is a standalone, 100% offline hypertrophy training and nutrition tracker for Android phones (with full parity in the web preview). This update makes the interface automatically adapt to any Android phone's screen dimensions, pixel density, notch/punch-hole cutout, status bar, and bottom gesture bar while adding a native Android Home Screen Progress & Streak Widget, a centralized Settings hub, and a complete offline nutrition calculator + meal composer.
- **Target Audience / Persona**: Lifters and athletes logging sets, RIR, vibration rest timers, and daily macros in the gym on any Android smartphone—with or without cellular/Wi-Fi connectivity—who want glanceable daily streak and progress accountability right on their phone's home screen.
- **Key Value**: Zero overlapping system clock/battery icons or clipped bottom tabs on modern edge-to-edge Android phones, glanceable home-screen streak & progress motivation, a clean uncluttered header, and effortless offline calorie/macro calculation + rapid multi-food meal building.

---

### 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Universal Phone Launch & Safe-Area Fit**: Upon opening the app on any Android phone (compact `320dp–360dp`, standard `390dp–412dp`, or large `430dp+` displays), the top header automatically pads below the status bar and camera cutout, horizontal filter chips scroll smoothly edge-to-edge without harsh mid-word clipping, and the 5-tab bottom bar sits cleanly above the Android gesture pill with balanced left/right safe padding.
  2. **Home Screen Progress & Streak Widget**: Users can place the **HyperLog Streak & Progress** widget onto their Android home screen either from their phone launcher's widget drawer or via a 1-tap **Pin Home Screen Widget** button inside HyperLog's Settings tab. The dark high-contrast athletic widget displays:
     - **Active Streak Badge**: Fiery orange flame crest with current consecutive logging days (`e.g., 12 Day Streak`) + best streak record and 7-day consistency dots (`M T W T F S S`).
     - **Training Volume Progress**: Current Mesocycle Week, completed sets vs planned weekly target sets (`e.g., 42 / 64 sets · 66%`), and an electric-blue progress bar.
     - **Daily Nutrition Progress**: Today's logged calories vs target (`e.g., 1,940 / 2,650 kcal`) and protein grams with an amber-orange progress bar.
     - **Instant Tap Actions**: Tapping the training side opens HyperLog directly to **Track Sets**; tapping the nutrition side opens **Calories**; and every logged set or meal inside the app immediately updates the home screen widget offline.
  3. **Dedicated Settings Tab**: Tapping the **Settings** button in the top-right header opens the dedicated Settings view. From here, users preview and pin the Home Screen Widget, switch themes (*Daylight, Night Slate, True AMOLED Black, Graphite*), export/import offline JSON backups, toggle weight units (`kg` / `lb`), configure Rest Timer default seconds, toggle native vibration haptics and Keep-Screen-On, or reset sample data.
  4. **Offline Body-Metric Calorie Calculator**: Inside the **Calories** tab, users expand or view the **Calorie & Macro Calculator** card, select sex (*Male / Female*), enter weight (`kg` or `lb`), height (`cm` or `ft/in`), age, activity multiplier (*Sedentary* through *Very Active*), and goal (*Mini-Cut, Maintenance, Lean Mass*). Live BMR, TDEE, and recommended daily Calories / Protein / Carbs / Fat update immediately offline, and tapping **Apply Targets** saves them to local storage.
  5. **Redesigned Custom Meal Composer**: Users build a meal in two seamless offline ways:
     - **Offline Food Picker**: Search or tap categorized whole foods (e.g., *Chicken Breast, Jasmine Rice, Whole Eggs, Oats, Whey Isolate, Greek Yogurt, Olive Oil, Banana, Salmon*), adjust gram or serving quantities, and watch item + total meal calories and macros sum automatically.
     - **Direct Custom Macro Entry**: Type or tweak Protein, Carbs, and Fat grams directly—total calories auto-calculate live (`4P + 4C + 9F`) with an optional manual calorie override toggle if logging a packaged label. Users can also save frequent custom meals as reusable offline presets.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: High-contrast athletic precision—clean, tactile card hierarchy built for one-handed gym legibility under bright overhead lights or dark evening sessions.
  - *Color Palette & Mood*:
    - Four user-selectable themes persisted locally: **Daylight** (`#F8FAFC` canvas / `#FFFFFF` cards), **Night Slate** (`#0B1120` canvas / `#131C31` cards), **True AMOLED** (`#000000` canvas / `#0B0F17` cards for OLED battery savings), and **Graphite** (`#121316` canvas / `#1C1E24` cards).
    - Semantic accents: Electric Cobalt (`#2563EB` / `#3B82F6`) for active navigation and volume progression, Fiery Amber-Orange (`#F97316`) for calorie energy rings and icon highlights, Emerald (`#10B981`) for optimal `1–3 RIR` and target-hit states, and Gold-Amber (`#F59E0B`) for `<1 RIR` near-failure sets.
  - *Typography & Hierarchy*: Bold geometric headings paired with tabular monospace numerals (`tabular-nums`) across all weight, rep, timer, and kilocalorie counters so numbers never jitter as values change. Dynamic text and spacing scale factors adapt padding and label sizes on narrow (`< 360dp`) vs wide (`>= 412dp`) Android screens.
  - *Component Styling & Layout*:
    - Minimum `44dp × 44dp` (`48dp` for primary CTAs) touch hitboxes across every tab item, stepper button, RIR selector, and meal action.
    - Combined sticky chrome (compact single-row top bar + 5-tab bottom bar) stays strictly within the 15% viewport budget so 85%+ of vertical screen height remains open for workout and nutrition cards.
    - Rounded `16dp–20dp` elevated surfaces with crisp `1dp` hairline borders instead of heavy drop shadows.

- **Interactive Feedback & Motion**:
  - Immediate color-coded active tab pills and top indicator bars with centered alignment across all 5 bottom tabs.
  - Live numeric recalculation on every keystroke or quantity stepper tap in both the Calorie Calculator and Custom Meal Builder—zero "Calculate" button lag.
  - Native Android status-bar and navigation-bar icon luminance (`light` vs `dark` system bar appearance) synchronized automatically whenever the user switches themes in Settings.

---

### 3. Key Product Decisions & Trade-Offs

- **Decision 1 — Dynamic Window Insets & Screen-Width Breakpoints**:
  - *Chosen Approach*: Attach live system-bar + display-cutout window inset listeners on Android (and `safe-area-inset-*` CSS variables on Web) combined with runtime screen-width buckets (`compact < 360dp`, `medium 360–411dp`, `expanded >= 412dp`).
  - *Why*: Android 15 (`targetSdk 35`) enforces mandatory edge-to-edge drawing, which caused the status bar (`9:16`, battery, Wi-Fi) to overlap the app header in the phone screenshot. Dynamic insets guarantee exact clearance on every Samsung, Pixel, Xiaomi, OnePlus, and Motorola device regardless of punch-hole height or gesture-bar mode.
  - *Alternatives Considered*: Hardcoding a fixed `24dp` top margin—rejected because punch-hole camera cutouts on modern phones are often `32dp–48dp` tall and 3-button Android navigation bars differ in height from gesture bars.

- **Decision 2 — 5 Bottom Tabs + Top-Right Settings Button**:
  - *Chosen Approach*: Maintain the 5 core training/nutrition tabs along the bottom thumb zone with equal flex weights and horizontal safe-margin padding, while moving Theme, Backup, Units, and Preferences into a dedicated **Settings** view triggered from a single top-right Settings pill/icon button.
  - *Why*: Eliminates the cramped `Theme` + `Backup` buttons from the header AND prevents 6 bottom labels from truncating on narrow phones.
  - *Alternatives Considered*: Squeezing 6 tabs into the bottom bar—passed over per your preference so all 5 primary tabs stay roomy and aligned.

- **Decision 3 — Mifflin-St Jeor + Offline Whole-Food & Macro Auto-Calc Engine**:
  - *Chosen Approach*: Embed a curated ~45-item offline hypertrophy food dictionary (per-100g and common household serving macros) alongside live `4P + 4C + 9F` calorie auto-summation and persistent user body metrics in local SQLite / IndexedDB.
  - *Why*: Works 100% offline on airplane mode with zero external API keys or network latency while eliminating manual calorie math.

- **Decision 4 — Event-Driven Offline Android Home Screen Widget**:
  - *Chosen Approach*: Build a native Android `AppWidgetProvider` reading directly from the local SQLite database and SharedPreferences, triggered both on periodic system intervals and **instantaneously** via explicit widget-update broadcasts whenever a set is completed, a meal is logged, or targets change—paired with Android 8.0+ `requestPinAppWidget` support in Settings.
  - *Why*: Background periodic widget updates on Android are throttled to 30+ minutes to save battery; pushing an immediate in-process widget broadcast on every user log guarantees the home screen streak and progress bars reflect changes the exact second the user swipes home, with zero battery drain or network calls.

---

### 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   DEVICE HARDWARE, LAUNCHER & WINDOW LAYER                  │
│  • Display Metrics (sw320dp–sw480dp+)   • Status / Cutout / Gesture Insets  │
│  • Native Vibration Motor (Rest Timer)  • Storage Access JSON Import/Export │
│  • Android Home Screen Widget Host  ◄───┼── Instant Broadcast + Deep Links  │
└──────────────────────────────────────┬──┴───────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ADAPTIVE APP SHELL & NAVIGATION                        │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Safe-Area Top Header: [Brand + Streak Pill]        [⚙ Settings Tab]   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Dynamic Viewport Router                                               │  │
│  │  ├─ 1. Anatomy Hub (Responsive Plane Toggle + Edge-Scroll Chips)      │  │
│  │  ├─ 2. Track Sets (RIR Color Badges + Native Haptic Rest Countdown)   │  │
│  │  ├─ 3. Workouts & Mesocycle Builder                                   │  │
│  │  ├─ 4. Exercise Library                                               │  │
│  │  ├─ 5. Calories & Nutrition Hub                                       │  │
│  │  │     ├─ Offline BMR/TDEE Calculator (Weight/Height/Age/Sex/Act/Goal)│  │
│  │  │     └─ Custom Meal Composer (Offline Food Search + 4P+4C+9F Calc)  │  │
│  │  └─ 6. Dedicated Settings View (Widget Pin/Preview, Themes, Backup)   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ Safe-Area 5-Tab Bottom Bar: Anatomy │ Track │ Workouts │ Library │ Cal│  │
│  └───────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     100% OFFLINE PERSISTENCE ENGINE                         │
│  • Native Android SQLite + SharedPreferences  /  Web IndexedDB + LocalStore │
│  • Tables: Workouts, SetLogs (+ Completed Date ISO), Landmarks,             │
│    NutritionGoals (+ Calculator Profile), DailyNutrition, SavedCustomMeals, │
│    ActivityStreakHistory, OfflineFoodCatalog                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - **Streak & Progress Snapshot**: Tracks daily active dates (`YYYY-MM-DD`) whenever at least one set is completed or one meal is logged. Computes `currentStreakDays` (consecutive active days up to today, or yesterday if today is still in progress so the streak isn't lost mid-morning), `longestStreakDays`, `last7DaysActiveFlags`, `weeklyCompletedSets / weeklyPlannedSets`, and `todayCalories / targetCalories`.
  - **Calculator Profile (persisted inside Nutrition Goals / Preferences)**: `sex` (`male` | `female`), `weightKg`, `heightCm`, `ageYears`, `activityLevel` (`1.2` sedentary to `1.9` athlete), and `phase` (`MiniCut`, `Maintenance`, `LeanMass`).
  - **Offline Food Item (built-in catalog)**: `id`, `name`, `category` (*Protein, Carbs, Fats, Dairy, Fruit*), `servingLabel` (e.g., `100g` or `1 scoop (32g)`), `gramsPerUnit`, and per-100g `proteinG`, `carbsG`, `fatG`, `calories`.
  - **Custom Meal Draft & Saved Presets**: Holds a list of selected food ingredients with gram quantities plus optional direct macro adjustments; dynamically computes `autoCalories = round(proteinG * 4 + carbsG * 4 + fatG * 9)` unless the user toggles custom kcal override, and allows saving custom meals for 1-tap future reuse.
  - **Settings Preferences**: `themeMode` (`Daylight`, `NightSlate`, `Amoled`, `Graphite`), `weightUnit` (`kg` | `lb`), `defaultRestSeconds`, `hapticVibrationEnabled`, and `keepScreenAwake`.

- **Interactive Component & State Mapping**:
  - **Home Screen Widget Provider & Deep-Link Router**: Queries the offline SQLite snapshot to populate `RemoteViews` (streak counter, 7-day consistency indicators, weekly sets progress bar, daily kcal/protein bar). Attaches `PendingIntent` deep-link extras (`target_tab = track` or `calories`) so tapping specific regions of the home screen widget opens HyperLog straight to the desired workflow, and exposes a 1-tap `requestPinAppWidget` trigger + live visual preview inside Settings.
  - **System Inset & Screen-Size Adapter**: Reads live top status/cutout inset and bottom navigation/gesture inset on attach and configuration change (portrait/landscape/split-screen), applying exact top padding to the header bar and bottom padding to the 5-tab bar while adjusting Status/Navigation bar icon contrast to match light vs dark themes.
  - **Settings Tab Controller**: Tapping the top-right Settings button highlights its active state and renders grouped preference cards (Home Screen Widget Preview & Pin Action, Appearance Theme Grid, Training & Rest Timer Haptics, Units, Offline JSON Backup Export/Import, and Factory Seed Reset).
  - **BMR / TDEE Calculator Handler**: Validates positive numeric ranges for weight (`25–300 kg`), height (`100–250 cm`), and age (`13–100 yrs`), computes Mifflin-St Jeor BMR (`10×kg + 6.25×cm - 5×age + 5` for male, `- 161` for female), multiplies by activity factor for TDEE, applies phase delta (`-500` Mini-Cut, `0` Maintenance, `+300` Lean Mass), sets protein (`2.0–2.2g/kg`) and fat (`0.8–0.9g/kg`), allocates remaining calories to carbs, and persists targets on **Apply Targets** (immediately refreshing the widget).
  - **Custom Meal Composer Handler**: Filters the offline food catalog instantaneously as the user types, appends/adjusts ingredient gram rows, sums total `P / C / F / kcal` live, supports direct macro-only entry with automatic `4P + 4C + 9F` calorie computation, logs the completed meal to the selected date with timestamp, records today's streak activity, and immediately refreshes the home screen widget.

- **Verification & APK Packaging Pipeline**:
  - Generate the high-resolution electric-blue and fiery-orange dumbbell crest icon and populate Android adaptive launcher layers (`mipmap-anydpi-v26` + `mdpi` through `xxxhdpi` PNGs) and web icons.
  - Register and test the resizable Android Home Screen Progress & Streak Widget (`AppWidgetProvider` + `RemoteViews` XML + launcher preview) alongside database migrations, layout insets, calculator math, and custom meal persistence.
  - Compile and sign the standalone universal release APK (`minSdk 26`, `targetSdk 35`), refresh the downloadable `.apk` and Android Studio `.zip` archive with updated SHA-256 checksums, and verify the web build cleanly.
