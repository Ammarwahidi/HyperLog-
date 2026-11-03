# HyperLog v4.0 — Day-Zero Logging Architecture, Project Timeline & Quality Assurance

---

## 1. Day-Zero Clean-Slate Data Management & Legacy Test Data Removal

All pre-populated demo/test data from prior iterations (`v1.0`–`v3.0`) has been completely removed so every user profile starts from an authentic **Day-Zero baseline**:

### Purged Legacy Test Artifacts
- **Web (`src/db/localStore.ts`)**:
  - Removed seeded historical workouts (`hist_m0_1`, `hist_m0_2`, `hist_m0_3`), pre-completed Week 3 sets, demo meals (`m_seed_*`, `m_v7_*`), synthetic `82.7 kg` Massing drift, pre-filled water/sleep wellbeing records, and `sync_init_1` Health Connect mock entries.
  - Added automatic one-time `day_zero_v4_0_clean_slate` migration so upgrading browsers automatically scrub legacy demo rows while preserving reference exercise/template catalogs.
- **Server (`server.ts` & `HyperLogData/`)**:
  - Cleared `HyperLogData/database/google_sync_receipts.json` (`[]`) and added `DELETE /api/google-sync/receipts` & `DELETE /api/logs/purge`.
- **Standalone Android APK (`HyperLogDatabase.kt`, SQLite Schema v10)**:
  - Removed the `if (isGuestVault)` demo workout/meal/`82.4 kg` branch in `seedDefaultsIntoDb()` and synthetic calorie/weight drift in `getNutritionWeightTrend()`.
  - Added automatic `oldVersion < 10` SQLite upgrade migration scrubbing legacy seed rows and materializing clean uncompleted **Week 1 · Day 1** slots (`0` completed sets, `0d` streak, `0` meals, neutral `70.0 kg` / `Maintenance` `2,350 kcal`).

---

## 2. Day-Zero Telemetry & Structured Logging Framework

### Architecture (`src/services/telemetryLogger.ts` & `HyperLogTelemetryLogger.kt`)
- **Day-Zero Clock (`dayZeroOffsetMin`)**: Records exact elapsed minutes from the user's clean-slate initialization (`T+0.0m`).
- **Event Levels & Categories**:
  - Levels: `INFO`, `METRIC`, `ACTION`, `WARN`, `ERROR`
  - Categories: `startup`/`lifecycle`, `navigation`, `workout`, `nutrition`, `ui`, `storage`, `sync`, `error`
- **Zero-Jank Performance Design**:
  - **Bounded 500-Event Ring Buffer**: Caps live entries at `500` in IndexedDB (`telemetry_logs`) and Android SQLite (`app_event_logs`), preventing unbounded storage growth.
  - **Asynchronous I/O**: Android writes to SQLite + `HyperLogData/logs/live_telemetry.jsonl` on a background thread (with automatic 512 KB file rotation); Web batches `/api/logs` flushes off the main UI frame.
- **Archive & Purge Lifecycle**:
  - **Archive**: Rotates live events into timestamped JSON snapshots (`HyperLogData/logs/archives/telemetry_archive_<ISO>.json` / `POST /api/logs/archive`) and resets the live buffer.
  - **Purge**: Wipes live logs (and optionally archives) via `DELETE /api/logs/purge` or `HyperLogTelemetryLogger.purgeLogsToDayZero()`, re-anchoring `dayZeroEpoch` to `T+0.0m`.

---

## 3. Redesign, Testing & Deployment Timeline

| Milestone | Schedule | Key Deliverables | Acceptance Gate |
| :--- | :--- | :--- | :--- |
| **M1 · Claymorphism Design System & Wireframes** | Days 1–2 | `Soft Clay 3D` & `Midnight Clay 3D` palettes, 3-layer CSS + Android `LayerDrawable` shadow engine, 4-screen interactive wireframes, `CLAYMORPHISM_UI_DESIGN_GUIDE.md` | WCAG AA/AAA contrast (`>= 4.5:1` / `15.1:1`) & `>= 44px`/`48dp` hitboxes |
| **M2 · Day-Zero Clean Slate & Telemetry Engine** | Days 3–4 | Legacy test data removal across SQLite v10, IndexedDB & server; bounded 500-event ring-buffer logger + archive/purge endpoints | `0` completed workouts, `0` meals, `0d` streak on fresh & upgraded installs |
| **M3 · Standalone Android APK v4.0 Compilation** | Days 5–6 | Synchronized Kotlin `UiKit`, `HyperLogDatabase` v10, `HyperLogTelemetryLogger.kt`, 4-byte `zipalign`, V1+V2+V3 cryptographic signing (`versionCode = 13`) | `apksigner verify` pass + clean offline install bundle `.ZIP` |
| **M4 · Playwright E2E Suite & CI/CD Pipeline** | Days 7–8 | Multi-viewport E2E tests (`390×844` Android mobile + `1440×900` desktop), HTML/JSON reporters, `.github/workflows/playwright-apk-ci.yml` | 100% pass across all Chromium & Mobile touch test specs |
| **M5 · Final QA Sign-Off & Release Packaging** | Day 9 | Full TypeScript lint, production Vite bundle, verified `/api/download/apk` binary streaming, complete documentation handoff | Zero build warnings/errors & all 6 deliverables verified |

---

## 4. Quality Assurance Criteria & Success Metrics

1. **Visual & Accessibility Integrity**:
   - Default active theme is `Claymorphism` (`data-theme="clay"` / `AppThemeMode.CLAYMORPHISM`) with verified multi-layer inner specular + clay rim shadows.
   - Body text contrast `>= 15.1:1` (AAA), primary button contrast `>= 7.4:1` (AAA), High-Contrast border mode & Reduced 3D Depth mode operational.
2. **Day-Zero Data Purity**:
   - Fresh boot and upgraded vaults contain `0` pre-logged workouts, `0` pre-logged meals, `0d` streak, and `0` legacy sync receipts while retaining full exercise (`106+` offline / `870+` syncable) and template catalogs.
3. **Performance & Logging Efficiency**:
   - Phase-1 First-10 exercise hydration completes in `< 50ms` locally; live telemetry ring buffer strictly bounded at `<= 500` events with verified JSON archive and purge operations.
4. **End-to-End & Binary Verification**:
   - `npm run lint`, `npm run build`, `npm run test:e2e`, and Android `assembleRelease` + `apksigner verify` pass with zero failures.
