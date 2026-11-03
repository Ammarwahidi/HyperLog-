# HyperLog Glassmorphism UI Design Guide (`v3.0.0`)

A complete, cross-platform user interface specification implementing **Glassmorphism** (`Pastel Glass` on Web & `FROST_GLASS` on Native Android) with strict WCAG AA/AAA accessibility and tactile zero-delay responsiveness.

---

## 1. Background — Frosted Depth & Soft Pastel Mesh

Glassmorphism relies on subtle multi-hue variation behind translucent surfaces so frosted blur creates genuine spatial depth without visual noise.

- **Web Pastel Mesh Canvas (`html[data-theme="pastel-glass"]`)**:
  - Multi-stop radial + `135deg` linear pastel gradient combining **Lavender Mist (`#EEF2FF`)**, **Sky Ice (`#E0F2FE`)**, **Mint Breeze (`#ECFDF5`)**, and **Rose Quartz (`#FDF2F8`)** with `background-attachment: fixed`.
- **Android Native Canvas (`AppThemeMode.FROST_GLASS`)**:
  - Soft airy ice-pastel canvas (`0xFFEEF4FF`) paired with translucent elevated surfaces (`0xEEFFFFFF`) and soft lavender-tint secondary containers (`0xFFE2ECF9`).
- **Blur Radius Calibration**:
  - **Header / Navigation Bar**: `backdrop-filter: blur(18px) saturate(155%)`
  - **Primary Surface Cards & Modals**: `backdrop-filter: blur(16px) saturate(150%)`
  - **Nested Subtle Controls**: `backdrop-filter: blur(12px) saturate(140%)`

---

## 2. Components — Translucent Surfaces, Specular Borders & Ambient Shadows

Every Glassmorphic component combines controlled white alpha, a `1px` luminous edge highlight, and a low-opacity ambient shadow:

| Component | Surface Fill | Border (`1px`) | Elevation / Shadow | Corner Radius |
| :--- | :--- | :--- | :--- | :--- |
| **Elevated Card (`.hl-card`)** | `rgba(255, 255, 255, 0.68)` | `rgba(255, 255, 255, 0.78)` | `0 12px 32px -10px rgba(15, 23, 42, 0.08)` + `inset 0 1px 0 rgba(255, 255, 255, 0.72)` | `16px–24px` (`20dp` Android) |
| **Modal Sheet** | `rgba(255, 255, 255, 0.76)` | `rgba(255, 255, 255, 0.85)` | `0 24px 48px -12px rgba(15, 23, 42, 0.16)` | `24px` (`24dp` Android) |
| **Secondary / Subtle Button** | `rgba(255, 255, 255, 0.54)` | `rgba(255, 255, 255, 0.75)` | `inset 0 1px 0 rgba(255, 255, 255, 0.65)` | `12px` (`14dp` Android) |
| **Primary CTA Button** | `#2563EB` (`95%` alpha) | `rgba(96, 165, 250, 0.50)` | `0 10px 22px -6px rgba(37, 99, 235, 0.45)` | `12px` (`14dp` Android) |
| **Frosted Input Field** | `rgba(255, 255, 255, 0.82)` | `rgba(148, 163, 184, 0.48)` | `2px` `#2563EB` focus ring on `:focus-visible` | `12px` |

---

## 3. Typography — Clean Modern Hierarchy & High Contrast

Pale or low-opacity text disappears over blurred pastel gradients. Typography is locked to crisp geometric sans-serifs and high-contrast slate ink:

- **Display Headings (`Outfit`, `600–700`, `-0.02em` tracking)**: `#0F172A` — **13.8:1 to 19.3:1 contrast** (WCAG AAA).
- **UI Body & Labels (`Plus Jakarta Sans`, `400–600`, `1.5` line-height)**: `#334155` — **7.4:1 contrast** (WCAG AAA).
- **Supporting Metadata (`Plus Jakarta Sans`, `500`)**: `#475569` — **4.8:1 contrast** (WCAG AA verified over pure white highlights).
- **Numeric Workout Metrics (`JetBrains Mono`, `tabular-nums`)**: Prevents horizontal layout jitter during live rest countdowns, tonnage totals, and streak updates.

---

## 4. Color Palette — Airy Pastel & Semantic Accent Tokens

- **Pastel Backdrop Stops**: `#EEF2FF` (Lavender Mist) · `#E0F2FE` (Sky Ice) · `#ECFDF5` (Mint Breeze) · `#FDF2F8` (Rose Quartz)
- **Interactive Cobalt**: `#2563EB` (Primary actions, active tabs, focus rings)
- **Consistency Emerald**: `#059669` (Completed sets, active streak days, offline-ready video badge)
- **Streak Amber-Flame**: `#EA580C` (Workout streak counter & milestone callouts)
- **Mist Rose Danger**: `#DC2626` ink / `rgba(239, 68, 68, 0.12)` surface (Delete mistaken workout / remove offline video)

---

## 5. Layout — Intuitive Hierarchy & Generous Whitespace

1. **Breathing Room**: Maintain `24px–32px` container padding and `16px–20px` gutters between cards so pastel background light remains visible around frosted edges.
2. **Card Density Ceiling**: Cap each glass card at **3 primary data points**; place secondary analytics or technical details inside progressive-disclosure dropdowns.
3. **Two-Layer Blur Limit**: Never stack more than two translucent blurred surfaces on top of one another to preserve GPU 60fps scrolling and crisp legibility.

---

## 6. Interactive Elements — Tactile Opacity & Scale Transitions

- **Hover State (Pointer Devices)**: Increase surface alpha (`0.54 → 0.84`), brighten border toward sky-blue (`rgba(147, 197, 253, 0.9)`), and apply `transform: scale(1.015)` over `140ms cubic-bezier(0.2, 0, 0, 1)`.
- **Active Press State (Web `.no-touch-delay` & Android `attachInstantPressFeedback`)**: Immediate compositor-only `scale(0.97)` + `alpha(0.92)` within `35ms` on `ACTION_DOWN` / `pointerdown`, eliminating the 300ms mobile tap delay.
- **Reduced Motion**: `@media (prefers-reduced-motion: reduce)` disables scale transforms while preserving instant opacity feedback.

---

## 7. Accessibility — Contrast Controls & Screen-Reader Compatibility

- **High-Contrast Glass Mode**: Elevates card fill to `rgba(255, 255, 255, 0.88)` and upgrades borders to `2px solid #1E293B` (`>= 7:1` WCAG AAA).
- **OS Reduced-Transparency Support**: `@media (prefers-reduced-transparency: reduce)` automatically disables `backdrop-filter` and switches to solid `#FFFFFF` surfaces with `#CBD5E1` borders.
- **Screen Readers (TalkBack & VoiceOver)**:
  - Decorative background gradients carry `aria-hidden="true"`.
  - Interactive switches (`role="switch"` + `aria-checked`), profile radio cards (`role="radiogroup"`), modals (`role="dialog"` + `aria-modal="true"`), and 14-day streak strips (`role="img"` + descriptive `aria-label`) announce complete context.
  - Non-color indicators (`✓` glyphs, text status labels) accompany all color-coded streak and offline states.

---

## 8. Three Annotated Reference Screens (Implemented Interactive Studio)

Open **Glass UI Guide** in the top navigation bar (or **Settings → Appearance → Open Glassmorphism Design Guide**) to inspect and interact with all three annotated screens:

1. **Screen A — Login & Isolated Profile Vaults**: Frosted authentication sheet over a 4-stop pastel mesh demonstrating per-user vault isolation (`User B: 0 sessions · 0d streak` clean slate vs `User A` private history).
2. **Screen B — Workout History, Streak & Nutrition Dashboard**: 2-column airy metric grid, 14-day frosted streak strip with `✓` glyphs, and phone-free manual workout entry + mistaken log deletion controls.
3. **Screen C — Settings & Offline Video Vault**: Live `8px / 16px / 24px` blur depth switcher, High-Contrast / Solid-Fallback toggles, and nested frosted cards for `HyperLogData/videos/offline_saved/` offline demo playback.
