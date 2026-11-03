# HyperLog v4.0 — Playwright End-to-End Testing & CI/CD Guide

## 1. Overview & Architecture

HyperLog v4.0 uses **Playwright (`@playwright/test`)** to verify all user journeys, Day-Zero clean-slate invariants, Claymorphism 3D visual styles, responsive mobile/desktop layouts, and Express/APK API endpoints against the live full-stack server (`http://127.0.0.1:3000`).

### Configured Projects (`playwright.config.ts`)
1. **`android-mobile-clay`** (`390 × 844`, `isMobile: true`, `hasTouch: true`): Simulates a modern Android touchscreen handset (Pixel 7 viewport) validating bottom-bar navigation, `>= 44px` touch targets, `.no-touch-delay` responsiveness, and mobile Claymorphic layouts.
2. **`desktop-chromium-clay`** (`1440 × 900`): Validates multi-column master-detail layouts, desktop header navigation, Claymorphism APK Studio wireframes, and full-stack telemetry APIs.

---

## 2. Running Playwright Tests Locally

```bash
# 1. Install Chromium browser binary (first time only)
npx playwright install chromium

# 2. Run the complete E2E suite across Desktop + Android Mobile projects
npm run test:e2e

# 3. View the interactive HTML report after test execution
npm run test:e2e:report
```

Test artifacts are automatically written to:
- `playwright-report/index.html` — Interactive visual HTML report with trace/failure diagnostics.
- `test-results/results.json` — Machine-readable JSON report for CI/CD dashboards.

---

## 3. E2E Test Case Catalog (`tests/e2e/`)

### 3.1 Navigation, Touch Responsiveness & Platform Parity Suite (`tests/e2e/navigation-and-upgrades.spec.ts`)

| Test ID | Suite / Scenario | Verified Assertions |
| :--- | :--- | :--- |
| **UPG-01** | **Tracker <-> Settings Navigation & Universal `.no-touch-delay`** | Verifies `Clay 3D Studio` is removed from `<header>`, navigates `Tracker` -> `Settings` -> `Tracker` -> `Settings`, and asserts **every** `<button>` on screen carries `.no-touch-delay` at each step. |
| **UPG-02** | **Framer Motion Set Entrance Animations (`Page2TrackSets`)** | Opens active Day 1 working sets, verifies `[data-framer-animated="true"]` set rows, toggles individual exercise focus pills (`exercise-set-focus-bar`) <-> `All Exercises`, and verifies `.no-touch-delay` across all controls. |
| **UPG-03** | **Claymorphism 32px Login Vault (`UserAuthAndPrivacyModal`)** | Opens the Account Vault modal, asserts `border-radius: 32px`, `inset` soft shadows, and subtle inner `gradient` background on `claymorphism-auth-shell`, toggles Sign In / Register modes, and audits `.no-touch-delay`. |
| **UPG-04** | **Theme Dropdown Menu, `Pastel Glass` & Clay 3D Studio in Settings** | Verifies all 7 themes live inside `theme-dropdown-select`, switches to `pastel-glass` and validates frosted translucent card surfaces, and opens `Clay 3D Studio` from inside `Settings`. |
| **UPG-05** | **Browser PWA `Workouts` Tab UI Audit** | Navigates to `Workouts`, verifies non-crushed `Templates` cards (`width >= 240px`), `7-Day Schedule` grid, `Calendar` sub-tab, zero runtime `pageerror` exceptions, and universal `.no-touch-delay`. |
| **UPG-06** | **Anatomical Volume Map, Wellness Dropdowns & Indian Recipe Videos** | Audits `anatomical-volume-map` (`anatomy-live-callout`, anterior/posterior SVGs, legend), verifies `wellness-section-dropdown` + collapsible meal/hydration/breathwork/1RM/HIIT dropdowns, and validates Indian cooking-style & per-dish recipe video links. |

### 3.2 Day-Zero Clean Slate, Claymorphism Studio & Telemetry Suite (`tests/e2e/hyperlog-claymorphism.spec.ts`)

| Test ID | Suite / Scenario | Verified Assertions |
| :--- | :--- | :--- |
| **E2E-01 & E2E-02** | **Day-Zero Clean Slate & Claymorphism 3D Default UI** | Asserts `0` legacy Google sync receipts, `html[data-theme="clay"]` default state, multi-layer inset/drop `box-shadow` on `.hl-card`, `.no-touch-delay` on visible buttons, and clean Custom Exercise Builder hero. |
| **E2E-03** | **4-Screen Claymorphism Wireframe Studio (via Settings)** | Navigates to `Settings` -> `Clay 3D Studio`, cycles through all 4 standalone APK screen wireframes (`Track`, `Anatomy`, `Library`, `Telemetry`), switches `Midnight Clay` / `Soft Clay 3D`, and tests WCAG accessibility toggles. |
| **E2E-04** | **Responsive Navigation & First-10 Library Observer** | Navigates across `Anatomy`, `Library`, and `Wellness`; verifies `Showing 10 of ...` initial batch rendering and dynamic IntersectionObserver scroll-to-load expansion. |
| **E2E-05** | **Custom Exercise Creation from Day Zero** | Creates a custom exercise directly from the homepage builder and verifies immediate rendering. |
| **E2E-06** | **Day-Zero Telemetry Logging, Archive, Purge & Signed APK** | Verifies telemetry ring-buffer capture (`POST /api/logs`), archive rotation (`POST /api/logs/archive`), UI log purge via `Settings` -> `Clay 3D Studio`, and validates `/api/download/manifest` (`v4.0.0`, `versionCode: 13`) + `/api/download/apk` (`PK\x03\x04` signed binary header). |

---

## 4. CI/CD Pipeline Integration (`.github/workflows/playwright-apk-ci.yml`)

Every `push` and `pull_request` executes two automated verification jobs:
1. **`web-and-playwright-e2e`**:
   - Installs Node 22 dependencies (`npm ci`) and Playwright Chromium (`npx playwright install --with-deps chromium`).
   - Runs static TypeScript verification (`npm run lint`) and production Vite bundling (`npm run build`).
   - Executes `npm run test:e2e` across both `android-mobile-clay` and `desktop-chromium-clay` projects.
   - Uploads `playwright-report/` and `test-results/results.json` as build artifacts (`if: always()`).
2. **`android-claymorphism-apk-build`**:
   - Configures JDK 17 + Android SDK Platform 35, compiles `./gradlew assembleRelease`, verifies `apksigner verify --verbose`, and uploads `HyperLog-v4.0-claymorphism-release.apk`.
