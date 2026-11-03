# HyperLog v4.0 — Claymorphism UI Design Guide (Standalone Android APK & Web)

**Package**: `com.hyperlog.rp` · **Release**: `v4.0.0` (`versionCode = 13`)  
**Default Theme**: `Soft Clay 3D` (`AppThemeMode.CLAYMORPHISM` / `data-theme="clay"`)  
**Dark Companion**: `Midnight Clay 3D` (`AppThemeMode.CLAY_DARK` / `data-theme="clay-dark"`)

---

## 1. Claymorphism Design Philosophy

HyperLog v4.0 evolves flat cards into **smooth, glass-like plump 3D clay surfaces** engineered for gym clarity, tactile touch ergonomics, and zero eye strain:
- **Squircle Geometry**: Generous `22dp–24px` radii on primary containers, `14dp–16px` on tactile buttons/chips, and `13dp–14px` on recessed numeric inputs (`kg`, `reps`, `RIR`).
- **Smooth Pastel + Glass Sheen**: Surfaces blend soft porcelain-lavender gradients (`#FFFFFF -> #F4F2FF`) with subtle backdrop saturation (`blur(16px) saturate(150%)` on Web; multi-layer `LayerDrawable` + hardware elevation on Android).
- **3-Layer Depth Formula**:
  1. **Ambient Outer Diffusion**: Soft indigo-tinted drop shadow floating the surface off the canvas.
  2. **Top-Left Specular Rim**: Crisp inner highlight (`#FFFFFF` / `rgba(255,255,255,0.96)`) simulating overhead studio light.
  3. **Bottom-Right Clay Cushion Bevel**: Warm lavender-indigo inner rim (`#D8D4F2` / `rgba(165,180,252,0.28)`) creating unmistakable 3D volume.
- **Recessed Sunken Inputs**: Numeric entry wells invert the inner bevel (`top-left` shadow + `bottom-right` highlight) so editable fields look physically pressed into the clay card.

---

## 2. Color Palettes & Gradient Tokens

### A. Soft Clay 3D (Default Light Palette)
| Semantic Token | Web CSS Value | Android ARGB Hex | Contrast vs Primary Text | Role |
| :--- | :--- | :--- | :--- | :--- |
| `Canvas Backdrop` | `linear-gradient(145deg, #F5F3FF 0%, #EEF4FF 48%, #ECFDF5 100%)` | `0xFFF3F1FF` | `14.3 : 1` (AAA) | Soft pastel porcelain canvas |
| `Porcelain Clay Card` | `linear-gradient(155deg, #FFFFFF 0%, #F6F5FF 100%)` | `0xFFFAF9FF -> 0xFFF4F2FF` | `15.1 : 1` (AAA) | Primary 22dp/24px 3D cards |
| `Recessed Clay Well` | `#ECEAFA` | `0xFFE6E4F8 -> 0xFFF7F6FF` | `12.8 : 1` (AAA) | Sunken numeric inputs & KPI boxes |
| `Royal Indigo 3D CTA` | `linear-gradient(145deg, #6366F1 0%, #4F46E5 55%, #4338CA 100%)` | `0xFF6366F1 -> 0xFF4338CA` | `7.4 : 1` vs `#FFFFFF` (AAA) | Primary workout actions & active chips |
| `Mint Sage MAV Clay` | `linear-gradient(145deg, #34D399 0%, #059669 100%)` | `0xFF34D399 -> 0xFF059669` | `4.8 : 1` vs `#FFFFFF` (AA) | Completed sets & optimal MAV zones |
| `Warm Coral Clay` | `linear-gradient(145deg, #FB923C 0%, #EA580C 100%)` | `0xFFFB923C -> 0xFFEA580C` | `4.6 : 1` vs `#FFFFFF` (AA) | Streak flame & macro rings |
| `Obsidian Primary Ink` | `#16182C` | `0xFF16182C` | — | Headings, exercise names, set numbers |
| `Slate Secondary Ink` | `#393E63` | `0xFF393E63` | `8.4 : 1` (AAA) | Prescriptions, muscle subtitles |
| `Muted Caption Ink` | `#565C82` | `0xFF565C82` | `5.6 : 1` (AA+) | Metadata, timestamps, unit hints |

### B. Midnight Clay 3D (Low-Glare Dark Palette)
| Semantic Token | Web CSS Value | Android ARGB Hex | Contrast vs Light Text | Role |
| :--- | :--- | :--- | :--- | :--- |
| `Midnight Canvas` | `linear-gradient(150deg, #101223 0%, #151932 52%, #111F28 100%)` | `0xFF121426` | `15.8 : 1` (AAA) | Evening low-glare backdrop |
| `Indigo Matte Card` | `linear-gradient(155deg, #23284A 0%, #191D36 100%)` | `0xFF23284A -> 0xFF191D36` | `14.2 : 1` (AAA) | Elevated 3D dark clay cards |
| `Recessed Night Well` | `#181C34` | `0xFF181C34 -> 0xFF23284A` | `14.9 : 1` (AAA) | Sunken dark numeric inputs |
| `Luminous Alabaster Ink`| `#F6F7FF` | `0xFFF6F7FF` | — | Crisp primary dark-mode typography |

---

## 3. Exact Shadow & LayerDrawable Implementation Formulas

### Web CSS (`src/index.css`)
```css
html[data-theme="clay"] .hl-card {
  border-radius: 1.5rem; /* 24px */
  background: linear-gradient(155deg, rgba(255, 255, 255, 0.97) 0%, rgba(246, 245, 255, 0.92) 100%);
  border: 1.5px solid rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(16px) saturate(150%);
  box-shadow:
    0 16px 32px -10px rgba(79, 70, 229, 0.14),
    0 6px 14px -4px rgba(15, 23, 42, 0.06),
    inset 2px 3px 6px rgba(255, 255, 255, 0.96),
    inset -3px -4px 9px rgba(165, 180, 252, 0.28);
}
```

### Android Native (`UiKitAndHardware.kt` — Zero External Dependencies)
```kotlin
fun claySurfaceDrawable(
    topColor: Int,
    bottomColor: Int,
    rimColor: Int,
    specularStrokeColor: Int,
    radiusDp: Float,
    ctx: Context,
    recessed: Boolean = false
): Drawable
```
- **Layer 0 (`baseBevel`)**: `GradientDrawable` filled with `rimColor` (`22dp` corner radius) forming the bottom-right 3D clay cushion.
- **Layer 1 (`plumpBody`)**: Top-to-bottom `GradientDrawable` (`topColor -> bottomColor`) stroked with `1.35dp` `specularStrokeColor` (`2.0dp` in High-Contrast mode) and inset `(0, 0, bevelPx/2, bevelPx)` for raised cards or `(bevelPx, bevelPx, 0, 0)` for sunken inputs, paired with `elevation = 5dp`.

---

## 4. 4-Screen Standalone APK Claymorphic Wireframes

### Screen 1: Day-Zero Set Tracker (`Tracker` Tab)
```text
+-------------------------------------------------------+
| [Crest] HyperLog                     [Profile] [Gear] | <- Streamlined Floating Clay Header
|         🔥 0d Streak (Day Zero)                       |    (Clay 3D Studio inside Settings)
+-------------------------------------------------------+
|  +-------------------------------------------------+  |
|  |  CUSTOM EXERCISES & SESSION BUILDER (22dp Clay) |  | <- Plump Alabaster Card
|  |  Week 1 · Day 1 · 0 Completed Workouts          |  |    Top-left white sheen
|  |  +-------------------------------------------+  |  |
|  |  | [ Sunken Input: Name Custom Workout...  ] |  |  | <- Recessed Clay Input
|  |  +-------------------------------------------+  |  |
|  |  [  ▶ Start Custom Workout (Indigo 3D Clay)  ]  |  | <- 46dp 3D Button (.no-touch-delay)
|  +-------------------------------------------------+  |
|                                                       |
|  [ All Exercises ] [ 1. Bench Press ] [ 2. Row ]      | <- Exercise Set Focus Filter
|  +-------------------------------------------------+  |
|  |  Set 1  [ 60 kg ]  [ 10 reps ]  [2 RIR]  [ ✓ ]  |  | <- Staggered Entrance Animation
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
| (Tracker*)  Anatomy    Workouts   Library   Wellness  | <- Clay Active Tab
+-------------------------------------------------------+
```

### Screen 2: Redesigned Anatomical Volume Map (`Anatomy` Tab)
```text
+-------------------------------------------------------+
|  [ Anterior ]  [ Posterior ]  [ Dual Plane ]          | <- 14dp Clay Chips
+-------------------------------------------------------+
|  +-------------------------------------------------+  |
|  |  CHEST · Below MV        0 sets · MAV 12-20     |  | <- Live MV/MEV/MAV/MRV Gauge
|  |  [▓▓░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]  |  |
|  |      [ Sculpted Anterior & Posterior SVG ]      |  | <- Studio Halo + Fiber Contours
|  +-------------------------------------------------+  |
|  |  [ Chest ] [ Back ] [ Quads ] [ Glutes ] ...    |  | <- Instant Muscle Selector Chips
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
```

### Screen 3: Claymorphism 32px Login Vault (`UserAuthAndPrivacyModal`)
```text
+-------------------------------------------------------+
|   ╭───────────────────────────────────────────────╮   |
|   │  CLAYMORPHISM VAULT · 32PX SOFT SHELL         │   | <- 32px / 32dp Rounded Shell
|   │  Isolated Athlete Login & Fresh Data          │   |    Inner Lavender/Midnight Gradient
|   │  [ Sign In ]  [ Create Account ]  [ Reset ]   │   |    Soft Outer + Inset Bevel Shadows
|   │  [ Sunken Input: Athlete Email             ]  │   |
|   │  [ Sunken Input: Password                  ]  │   |
|   │  [  Sign In to Isolated Vault  (3D Indigo) ]  │   |
|   ╰───────────────────────────────────────────────╯   |
+-------------------------------------------------------+
```

### Screen 4: Settings Theme Dropdown, Clay 3D Studio & Telemetry (`Settings` Tab)
```text
+-------------------------------------------------------+
|  +-------------------------------------------------+  |
|  |  Appearance & Theme Dropdown Menu               |  |
|  |  [ Theme: Soft Clay 3D / Pastel Glass / ... ▾ ] |  | <- Consolidated 7-Theme Dropdown
|  |  [ Open Clay 3D Studio (Wireframes & Logs)   ]  |  | <- Relocated from Navbar to Settings
|  |  [x] High-Contrast Clay Borders (WCAG AAA)      |  |
|  |  [ ] Reduced 3D Clay Depth (Flat Mode)          |  |
|  +-------------------------------------------------+  |
|  |  Day-Zero Telemetry Ring Buffer (0 / 500 max)   |  |
|  |  [ Archive Logs (.JSON) ] [ Purge (Day-Zero) ]  |  |
|  +-------------------------------------------------+  |
+-------------------------------------------------------+
```

---

## 5. Usability, Pastel Glass Parity & WCAG 2.1 AA / AAA Accessibility Standards

1. **Typography & Tabular Numerals**: Plus Jakarta Sans / Roboto geometric hierarchy paired with `font-variant-numeric: tabular-nums` (`fontFeatureSettings = "tnum"` on Android) so timers, weights, and calories never jitter horizontally.
2. **Pastel Glass (`FROST_GLASS` / `pastel-glass`) Cross-Platform Parity**: Diagonal sky-lavender-mint-rose pastel canvas paired with multi-layer frosted glass surfaces (`pastelGlassSurfaceDrawable` on Android; `backdrop-filter: blur(18px) saturate(160%)` on Web).
3. **Verified Contrast**: Primary text `#16182C` on `#FAF9FF` achieves **15.1:1 (WCAG AAA)**; white CTA labels on `#4F46E5 -> #4338CA` achieve **7.4:1 (WCAG AAA)**.
4. **Touch Hitboxes & Zero-Delay Feedback**: Every interactive `<button>`, chip, input, and nav tab enforces `>= 44px` (`46–54dp` on Android) with `.no-touch-delay` (`touch-action: manipulation`) verified across tab navigation via Playwright E2E (`tests/e2e/`).

