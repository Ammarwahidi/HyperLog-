import { expect, Page, test } from '@playwright/test';

async function assertAllButtonsHaveNoTouchDelay(page: Page, contextLabel: string) {
  const audit = await page.locator('button').evaluateAll((buttons) => {
    const missing = buttons
      .filter((btn) => !btn.classList.contains('no-touch-delay'))
      .map((btn) => (btn.textContent || btn.getAttribute('aria-label') || 'unnamed-button').trim().slice(0, 40));
    return {
      totalButtons: buttons.length,
      missing,
    };
  });

  expect(audit.totalButtons, `[${contextLabel}] Expected interactive buttons on screen`).toBeGreaterThan(0);
  expect(
    audit.missing,
    `[${contextLabel}] Found buttons missing .no-touch-delay: ${audit.missing.join(', ')}`
  ).toEqual([]);
}

test.describe('HyperLog v4.0 — Synchronized Navigation, Claymorphism Auth, Framer Motion Sets & PWA UI Suite', () => {
  test('UPG-01: Tracker <-> Settings tab navigation & universal no-touch-delay class on all buttons', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');
    await expect(page.getByText('HyperLog').first()).toBeVisible();

    // Clay 3D Studio must NOT appear in the top navigation header anymore
    await expect(page.locator('header').getByTestId('open-clay-studio-btn')).toHaveCount(0);

    // Check all buttons on initial Tracker view
    await assertAllButtonsHaveNoTouchDelay(page, 'Initial Tracker Tab');

    // Navigate from Tracker -> Settings
    await page.getByTestId('nav-tab-settings').click();
    await expect(page.getByRole('heading', { name: /Settings & Preferences/i })).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Settings Tab');

    // Navigate back from Settings -> Tracker
    const trackerBtn = isMobile
      ? page.getByTestId('mobile-nav-tab-tracker')
      : page.getByTestId('nav-tab-tracker');
    await trackerBtn.click();
    await expect(page.getByTestId('daily-workout-progress-card')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Returned Tracker Tab');

    // Navigate back to Settings one more time to confirm repeatable zero-delay state
    await page.getByTestId('nav-tab-settings').click();
    await expect(page.getByTestId('theme-dropdown-select')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Settings Tab Repeat');
  });

  test('UPG-02: Framer Motion set entrance animations & exercise focus toggling in Page2TrackSets', async ({
    page,
  }) => {
    await page.goto('/');

    // Open Day 1 Sets directly from the Tracker view
    const openDaySetsBtn = page.getByTestId('quick-open-day-sets-btn');
    await expect(openDaySetsBtn).toBeVisible();
    await openDaySetsBtn.click();

    // Exercise Set Focus bar & unified Workout Session Card should be visible
    const focusBar = page.getByTestId('exercise-set-focus-bar');
    await expect(focusBar).toBeVisible();
    await expect(page.getByTestId('workout-session-card')).toBeVisible();

    // Initially, exercises use compact single-row layout with sets hidden behind Expand
    const animatedSetRows = page.locator('[data-framer-animated="true"]');
    await expect(animatedSetRows).toHaveCount(0);

    // Expand the first exercise row via its Expand icon button to trigger Framer Motion entrance
    const firstExpandBtn = page.locator('[data-testid^="expand-exercise-btn-"]').first();
    await firstExpandBtn.click();
    await expect(animatedSetRows.first()).toBeVisible();
    const expandedRowCount = await animatedSetRows.count();
    expect(expandedRowCount).toBeGreaterThanOrEqual(2);

    // Toggle to a single exercise's sets and back to All Exercises to exercise Framer Motion transitions
    const focusButtons = focusBar.locator('button');
    const focusBtnCount = await focusButtons.count();
    expect(focusBtnCount).toBeGreaterThanOrEqual(2);

    await focusButtons.nth(1).click();
    await expect(animatedSetRows.first()).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Focused Exercise Sets');

    await page.getByTestId('exercise-focus-btn-all').click();
    await expect(animatedSetRows.first()).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'All Exercise Sets');
  });

  test('UPG-03: Claymorphism 32px Login modal (soft shadows, rounded 32px corners & inner gradients)', async ({
    page,
  }) => {
    await page.goto('/');

    // Open Account / Login modal from header
    await page.getByTestId('open-account-auth-btn').click();

    const authShell = page.getByTestId('claymorphism-auth-shell');
    await expect(authShell).toBeVisible();

    const styles = await authShell.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        borderRadius: cs.borderRadius,
        boxShadow: cs.boxShadow,
        backgroundImage: cs.backgroundImage,
      };
    });

    expect(styles.borderRadius).toBe('32px');
    expect(styles.boxShadow).toContain('inset');
    expect(styles.backgroundImage).toContain('gradient');

    await assertAllButtonsHaveNoTouchDelay(page, 'Claymorphism Auth Modal - Sign In');

    // Toggle auth modes and confirm all buttons retain no-touch-delay
    await page.getByTestId('auth-mode-register-btn').click();
    await expect(page.getByTestId('email-register-submit')).toContainText(/Create Secure Clay Vault/i);
    await assertAllButtonsHaveNoTouchDelay(page, 'Claymorphism Auth Modal - Register');

    await page.getByTestId('close-clay-auth-modal-btn').click();
    await expect(authShell).toBeHidden();
  });

  test('UPG-04: Theme Dropdown Menu in Settings, Pastel Glass theme consistency & Clay 3D Studio inside Settings', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('nav-tab-settings').click();

    const themeDropdown = page.getByTestId('theme-dropdown-select');
    await expect(themeDropdown).toBeVisible();

    // Verify all 7 theme options live inside the dropdown menu
    const optionValues = await themeDropdown.locator('option').evaluateAll((opts) =>
      opts.map((o) => (o as HTMLOptionElement).value)
    );
    expect(optionValues).toEqual([
      'clay',
      'clay-dark',
      'light',
      'pastel-glass',
      'dark',
      'amoled',
      'graphite',
    ]);

    // Select Pastel Glass and verify document theme + frosted glass styling
    await themeDropdown.selectOption('pastel-glass');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'pastel-glass');
    await expect(page.getByTestId('active-theme-preview-card')).toContainText(/Pastel Glass/i);

    const cardBackdrop = await page.locator('.hl-card').first().evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        backdropFilter: cs.backdropFilter || (cs as unknown as Record<string, string>).webkitBackdropFilter || '',
        backgroundColor: cs.backgroundColor,
      };
    });
    expect(cardBackdrop.backgroundColor).not.toBe('rgb(255, 255, 255)');

    // Open Clay 3D Studio from inside Settings
    await page.getByTestId('open-clay-studio-btn').click();
    await expect(page.getByTestId('claymorphism-studio-modal')).toBeVisible();
    await page.getByTestId('close-clay-studio-btn').click();

    // Restore Soft Clay 3D default
    await themeDropdown.selectOption('clay');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clay');
  });

  test('UPG-05: Browser PWA Workout tab UI audit (Templates, 7-Day Schedule & Calendar layout integrity)', async ({
    page,
    isMobile,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/');
    const workoutsNav = isMobile
      ? page.getByTestId('mobile-nav-tab-workouts')
      : page.getByTestId('nav-tab-workouts');
    await workoutsNav.click();

    const workoutsRoot = page.getByTestId('workouts-page-root');
    await expect(workoutsRoot).toBeVisible();

    // Templates sub-tab must display non-crushed template cards
    const templateGrid = page.getByTestId('workouts-template-grid');
    await expect(templateGrid).toBeVisible();
    const firstCardBox = await templateGrid.locator('.hl-card').first().boundingBox();
    expect(firstCardBox).not.toBeNull();
    expect(firstCardBox!.width).toBeGreaterThanOrEqual(240);
    await assertAllButtonsHaveNoTouchDelay(page, 'Workouts - Templates');

    // Switch to 7-Day Schedule sub-tab
    await page.getByTestId('workouts-subtab-schedule').click();
    await expect(page.getByTestId('workouts-schedule-grid')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Workouts - 7-Day Schedule');

    // Switch to Calendar sub-tab
    await page.getByTestId('workouts-subtab-calendar').click();
    await assertAllButtonsHaveNoTouchDelay(page, 'Workouts - Calendar');

    expect(pageErrors).toEqual([]);
  });

  test('UPG-06: Redesigned Anatomical Volume Map, Wellness dropdown menus & Indian food/recipe video links', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');

    // 1. Redesigned Anatomical Volume Map
    const anatomyNav = isMobile
      ? page.getByTestId('mobile-nav-tab-anatomy')
      : page.getByTestId('nav-tab-anatomy');
    await anatomyNav.click();

    await expect(page.getByTestId('anatomical-volume-map')).toBeVisible();
    await expect(page.getByTestId('anatomy-live-callout')).toBeVisible();
    await expect(page.getByTestId('anatomy-svg-anterior')).toBeVisible();
    await expect(page.getByTestId('anatomy-svg-posterior')).toBeVisible();
    await expect(page.getByTestId('anatomy-volume-legend')).toBeVisible();

    await page.getByTestId('anatomy-chip-back').click();
    await expect(page.getByTestId('anatomy-live-callout')).toContainText(/Back/i);
    await assertAllButtonsHaveNoTouchDelay(page, 'Anatomy Tab');

    // 2. Wellness Unified Tab Bar (duplicate select#wellness-section-select removed) & Indian Recipe Video Links
    const wellnessNav = isMobile
      ? page.getByTestId('mobile-nav-tab-wellness')
      : page.getByTestId('nav-tab-wellness');
    await wellnessNav.click();

    await expect(page.locator('select#wellness-section-select')).toHaveCount(0);
    await expect(page.getByTestId('wellness-section-dropdown')).toHaveCount(0);
    await expect(page.getByTestId('wellness-subtab-wellbeing')).toBeVisible();
    await expect(page.getByTestId('wellness-subtab-breathing')).toBeVisible();

    // Verify collapsible dropdown menus on initial Daily Hub / Nutrition view
    await expect(page.getByTestId('wellness-dropdown-meal-slots')).toBeVisible();
    await expect(page.getByTestId('wellness-dropdown-hydration')).toBeVisible();
    await expect(page.getByTestId('wellness-dropdown-breathwork')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Wellness - Daily Hub');

    // Switch via unified Wellness Tab Bar to Indian Meals & verify Cooking-Style + Dish + Pantry Recipe Video links
    await page.getByTestId('wellness-subtab-indian').click();

    const styleVideoLinks = page.locator('[data-testid^="indian-style-video-"]');
    await expect(styleVideoLinks.first()).toBeVisible();
    expect(await styleVideoLinks.count()).toBeGreaterThanOrEqual(6);
    const firstVideoHref = await styleVideoLinks.first().getAttribute('href');
    expect(firstVideoHref).toContain('youtube.com/results?search_query=');

    const dishVideoLinks = page.locator('[data-testid^="indian-recipe-video-"]');
    await expect(dishVideoLinks.first()).toBeVisible();
    expect(await dishVideoLinks.count()).toBeGreaterThanOrEqual(6);

    const regionalRecipeVideos = page.locator('[data-testid^="indian-nutrition-video-"]');
    await expect(regionalRecipeVideos.first()).toBeVisible();
    expect(await regionalRecipeVideos.count()).toBeGreaterThanOrEqual(6);
    await assertAllButtonsHaveNoTouchDelay(page, 'Wellness - Indian Meals');

    // Switch via unified Wellness Tab Bar to Tools & verify 1RM/HIIT dropdowns
    await page.getByTestId('wellness-subtab-tools').click();
    await expect(page.getByTestId('wellness-dropdown-1rm')).toBeVisible();
    await expect(page.getByTestId('wellness-dropdown-hiit')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Wellness - Tools');
  });

  test('UPG-07: Progressive Disclosure Tracker — single completion ring, zero redundant dropdowns & View Deep Analytics sheet', async ({
    page,
  }) => {
    await page.goto('/');

    // Initial state: warm greeting + single progress card + View Deep Analytics collapsed
    await expect(page.getByTestId('tracker-warm-greeting')).toContainText(/Good (morning|afternoon|evening)/i);
    await expect(page.getByTestId('daily-workout-progress-card')).toBeVisible();
    await expect(page.getByTestId('daily-completion-ring')).toBeVisible();
    await expect(page.getByTestId('deep-analytics-panel')).toHaveCount(0);

    // Confirm all 4 redundant Tracker dropdowns are completely removed
    for (const removedId of [
      'home-dropdown-templates',
      'home-dropdown-calendar',
      'home-dropdown-volume',
      'home-dropdown-wellness',
    ]) {
      await expect(page.getByTestId(removedId)).toHaveCount(0);
    }

    // Expand "View Deep Analytics" and verify secondary metrics + strength trend accordions
    const toggleBtn = page.getByTestId('toggle-deep-analytics-btn');
    await expect(toggleBtn).toContainText(/View Deep Analytics/i);
    await toggleBtn.click();

    const analyticsPanel = page.getByTestId('deep-analytics-panel');
    await expect(analyticsPanel).toBeVisible();
    await expect(page.getByTestId('metric-active-calories')).toContainText(/kcal/i);
    await expect(page.getByTestId('metric-heart-rate')).toContainText(/bpm/i);
    await expect(page.getByTestId('metric-total-sets-lifted')).toContainText(/today/i);
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Deep Analytics Open');

    // Open Strength Weight Trends accordion and Sets Completed accordion
    await page.getByTestId('analytics-toggle-weight-trends').click();
    await expect(analyticsPanel).toContainText(/Dumbbell Peak/i);
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Weight Trends Accordion');

    await page.getByTestId('analytics-toggle-sets-breakdown').click();
    await expect(analyticsPanel).toContainText(/Sets Completed & 7-Day Rhythm/i);
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Sets Breakdown Accordion');

    // Collapse Deep Analytics cleanly
    await toggleBtn.click();
    await expect(page.getByTestId('deep-analytics-panel')).toHaveCount(0);
  });

  test('UPG-08: Consolidated Health Integration sub-section in Settings & simplified main interface without duplicate sync controls', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Open active workout sets on Tracker and verify Health Connect sync/export buttons are gone from main interface
    await page.getByTestId('quick-open-day-sets-btn').click();
    await page.getByTestId('toggle-pump-checkin-drawer-btn').click();
    await expect(page.getByRole('button', { name: /Sync Health Connect/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Export Health JSON/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Share Session PDF/i })).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Simplified Pump Check-In Drawer');

    // 2. Navigate to Settings and verify the single dedicated Health Integration sub-section
    await page.getByTestId('nav-tab-settings').click();
    const healthSection = page.getByTestId('settings-health-integration-section');
    await expect(healthSection).toBeVisible();
    await expect(healthSection.getByRole('heading', { name: 'Health Integration' })).toBeVisible();

    // Verify Google Fit & Health Connect switches work inside Health Integration
    const googleSwitch = page.getByTestId('toggle-auto-google-fit');
    const hcSwitch = page.getByTestId('toggle-auto-health-connect');
    await expect(googleSwitch).toHaveAttribute('aria-checked', 'true');
    await expect(hcSwitch).toHaveAttribute('aria-checked', 'true');

    await googleSwitch.click();
    await expect(googleSwitch).toHaveAttribute('aria-checked', 'false');
    await googleSwitch.click();
    await expect(googleSwitch).toHaveAttribute('aria-checked', 'true');

    // Trigger manual Google Fit sync & Health Connect queue from Settings -> Health Integration
    await page.getByTestId('settings-sync-google-fit-btn').click();
    await expect(page.getByTestId('settings-google-fit-receipts-list')).toBeVisible();

    await page.getByTestId('settings-queue-health-connect-btn').click();
    await expect(page.getByTestId('settings-health-outbox-list')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Settings - Health Integration Populated');

    // Cleanly clear receipts and outbox from Settings -> Health Integration
    await page.getByTestId('settings-clear-google-fit-btn').click();
    await expect(page.getByTestId('settings-google-fit-receipts-list')).toHaveCount(0);

    await page.getByTestId('settings-clear-health-outbox-btn').click();
    await expect(page.getByTestId('settings-health-outbox-list')).toHaveCount(0);
  });

  test('UPG-09: Holistic Progressive Disclosure across Active Tracker, Anatomy, Workouts, Library & Wellness', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');

    // 1. Active Workout on Tracker: 7-day strip & optional RPE column collapsed by default
    await page.getByTestId('quick-open-day-sets-btn').click();
    const dayStripBtn = page.getByTestId('toggle-active-day-strip-btn');
    await expect(dayStripBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('[aria-label$="optional RPE (1 to 10)"]')).toHaveCount(0);

    // Reveal 7-day strip on demand, then reveal optional RPE column via Timer & Effort Options
    await dayStripBtn.click();
    await expect(dayStripBtn).toHaveAttribute('aria-expanded', 'true');
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker Active - Day Strip Open');

    await page.getByTestId('toggle-timer-effort-options-btn').click();
    await page.getByTestId('toggle-optional-rpe-col').check();
    await page.locator('[data-testid^="expand-exercise-btn-"]').first().click();
    await expect(page.locator('[aria-label$="optional RPE (1 to 10)"]').first()).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker Active - Optional RPE Revealed');

    // 2. Anatomy: Weekly Muscle Balance summary card up front; KPI numbers & raw landmarks tucked away
    await (isMobile
      ? page.getByTestId('mobile-nav-tab-anatomy')
      : page.getByTestId('nav-tab-anatomy')
    ).click();
    await expect(page.getByTestId('anatomy-calm-summary-card')).toBeVisible();
    await expect(page.getByTestId('anatomy-kpis-panel')).toHaveCount(0);
    await expect(page.getByTestId('muscle-landmarks-panel')).toHaveCount(0);

    await page.getByTestId('toggle-anatomy-kpis-btn').click();
    await expect(page.getByTestId('anatomy-kpis-panel')).toBeVisible();
    await page.getByTestId('toggle-muscle-landmarks-btn').click();
    await expect(page.getByTestId('muscle-landmarks-panel')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Anatomy - Progressive Disclosure Expanded');

    // 3. Workouts: Filter rows collapsed behind "Filter Routines" by default
    await (isMobile
      ? page.getByTestId('mobile-nav-tab-workouts')
      : page.getByTestId('nav-tab-workouts')
    ).click();
    const workoutFiltersBtn = page.getByTestId('toggle-workout-filters-btn');
    await expect(workoutFiltersBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByTestId('workout-filters-panel')).toHaveCount(0);
    await workoutFiltersBtn.click();
    await expect(page.getByTestId('workout-filters-panel')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Workouts - Filters Expanded');

    // 4. Library: Multi-row filters collapsed behind "Filter by Muscle, Experience Level or Gear"
    await (isMobile
      ? page.getByTestId('mobile-nav-tab-library')
      : page.getByTestId('nav-tab-library')
    ).click();
    const libFiltersDropdown = page.getByTestId('library-filters-dropdown');
    await expect(libFiltersDropdown).toBeVisible();
    await expect(libFiltersDropdown.locator('button').first()).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await libFiltersDropdown.locator('button').first().click();
    await expect(libFiltersDropdown.locator('button').first()).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    await assertAllButtonsHaveNoTouchDelay(page, 'Library - Filters Expanded');

    // 5. Wellness: Calm "Today's Daily Balance" card up front, secondary macros tucked away
    await (isMobile
      ? page.getByTestId('mobile-nav-tab-wellness')
      : page.getByTestId('nav-tab-wellness')
    ).click();
    await expect(page.getByTestId('wellness-daily-balance-card')).toBeVisible();
    await expect(page.getByTestId('wellness-macro-details-panel')).toHaveCount(0);
    await expect(page.getByTestId('wellness-food-search-input')).toBeHidden();

    await page.getByTestId('toggle-wellness-macro-details-btn').click();
    await expect(page.getByTestId('wellness-macro-details-panel')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Wellness - Macro Details Expanded');

    // Nutrition tab: Preset Meals & Trend Chart collapsed by default
    await page.getByTestId('wellness-subtab-nutrition').click();
    await expect(page.getByTestId('toggle-preset-meals-btn')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await expect(page.getByTestId('toggle-nutrition-chart-btn')).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    await assertAllButtonsHaveNoTouchDelay(page, 'Wellness - Nutrition Progressive Disclosure');
  });

  test('UPG-10: Exercise History icon & mini-modal toggle (recent 3 setLogs) + signed Build 16 APK verification', async ({
    page,
    request,
  }) => {
    await page.goto('/');

    // 1. Open active workout sets on Tracker; verify History icon button is directly on the compact .hl-card row
    await page.getByTestId('quick-open-day-sets-btn').click();
    const firstStrengthCard = page.locator('[data-testid^="strength-card-"]').first();
    await expect(firstStrengthCard).toHaveClass(/hl-card/);

    const firstHistoryBtn = firstStrengthCard.locator('[data-testid^="exercise-history-btn-"]');
    await expect(firstHistoryBtn).toBeVisible();
    await expect(firstHistoryBtn).toContainText(/History/i);
    const initialTitleAttr = await firstHistoryBtn.getAttribute('title');
    expect(initialTitleAttr).toContain('previous 3 sets');

    // 2. Click History icon button to toggle mini-modal OPEN, then click it again to toggle mini-modal CLOSED
    await firstHistoryBtn.click();
    const miniModal = page.getByTestId('exercise-history-mini-modal');
    await expect(miniModal).toBeVisible();
    await expect(page.getByTestId('exercise-history-empty-state')).toBeVisible();
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Exercise History Empty Mini-Modal');

    await firstHistoryBtn.click();
    await expect(miniModal).toHaveCount(0);

    // 3. Expand the exercise .hl-card, complete 3 sets into `setLogs`, then toggle its History mini-modal
    const firstExpandBtn = firstStrengthCard.locator('[data-testid^="expand-exercise-btn-"]');
    await firstExpandBtn.click();
    await expect(firstExpandBtn).toHaveAttribute('aria-expanded', 'true');

    const checkButtons = firstStrengthCard.locator('button[aria-label^="Mark set "]');
    const setCount = await checkButtons.count();
    const setsToComplete = Math.min(3, setCount);
    expect(setsToComplete).toBeGreaterThanOrEqual(2);

    for (let i = 0; i < setsToComplete; i++) {
      await checkButtons.nth(i).click();
    }

    await expect(firstHistoryBtn).toContainText(`History (${setsToComplete})`);
    await firstHistoryBtn.click();

    await expect(miniModal).toBeVisible();
    await expect(page.getByTestId('exercise-history-sets-list')).toBeVisible();
    const historyRows = page.locator('[data-testid^="exercise-history-row-"]');
    await expect(historyRows).toHaveCount(setsToComplete);
    await expect(historyRows.nth(0)).toContainText('Set 1');
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Exercise History Populated Mini-Modal');

    await page.getByTestId('close-exercise-history-modal-btn').click();
    await expect(miniModal).toHaveCount(0);

    // 4. Verify freshly compiled & signed standalone Android APK (Build 16) manifest & binary stream
    const manifestRes = await request.get('/api/download/manifest');
    expect(manifestRes.ok()).toBeTruthy();
    const manifestJson = await manifestRes.json();
    expect(manifestJson.versionCode).toBe(16);

    const apkHeadRes = await request.get('/api/download/apk/v4.0/HyperLog-v4.0-claymorphism-release.apk');
    expect(apkHeadRes.ok()).toBeTruthy();
    const apkBuf = await apkHeadRes.body();
    expect(apkBuf.length).toBeGreaterThan(500_000);
    expect(apkBuf[0]).toBe(0x50);
    expect(apkBuf[1]).toBe(0x4b);
    expect(apkBuf[2]).toBe(0x03);
    expect(apkBuf[3]).toBe(0x04);
  });

  test('UPG-11: Compact single-row .hl-card layout with Expand icon CSS-transition reveal of hidden weight/rep history div', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('quick-open-day-sets-btn').click();

    const sessionList = page.getByTestId('workout-session-card');
    await expect(sessionList).toBeVisible();

    const exerciseCards = sessionList.locator('[data-testid^="strength-card-"]');
    const cardCount = await exerciseCards.count();
    expect(cardCount).toBeGreaterThanOrEqual(2);

    const firstCard = exerciseCards.first();
    await expect(firstCard).toHaveClass(/hl-card/);

    // 1. Default state: .hl-card is a single compact row (<= 80px height)
    const initialCardBox = await firstCard.boundingBox();
    expect(initialCardBox).not.toBeNull();
    expect(initialCardBox!.height).toBeLessThanOrEqual(80);

    // 2. Hidden div exists in DOM with CSS transitions & visibility: hidden by default
    const detailsPanel = firstCard.locator('[data-testid^="exercise-details-panel-"]');
    const repWeightHistory = firstCard.locator('[data-testid^="exercise-rep-weight-history-"]');
    await expect(detailsPanel).toHaveCount(1);
    await expect(detailsPanel).toHaveAttribute('data-expanded', 'false');
    await expect(repWeightHistory).toBeHidden();

    const collapsedCss = await detailsPanel.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        visibility: cs.visibility,
        opacity: cs.opacity,
        transitionProperty: cs.transitionProperty,
      };
    });
    expect(collapsedCss.visibility).toBe('hidden');
    expect(collapsedCss.opacity).toBe('0');
    expect(collapsedCss.transitionProperty).toContain('grid-template-rows');

    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Compact Single-Row .hl-card');

    // Attach CSSAnimation recorder for firstCard's exact testid BEFORE clicking so headless compositor jitter never drops events
    const firstCardTestId = await firstCard.getAttribute('data-testid');
    expect(firstCardTestId).toBeTruthy();
    await page.evaluate((targetTestId) => {
      const win = window as unknown as { __hlCardPopEvents?: string[] };
      win.__hlCardPopEvents = [];
      const recordName = (name?: string) => {
        if (name && !win.__hlCardPopEvents?.includes(name)) {
          win.__hlCardPopEvents?.push(name);
        }
      };
      document.addEventListener(
        'animationstart',
        (ev) => {
          const target = ev.target as HTMLElement | null;
          if (target && target.getAttribute('data-testid') === targetTestId) {
            recordName((ev as AnimationEvent).animationName);
          }
        },
        true
      );
      const cardEl = document.querySelector(`[data-testid="${targetTestId}"]`);
      if (cardEl) {
        const obs = new MutationObserver(() => {
          for (const anim of cardEl.getAnimations()) {
            const cssAnim = anim as CSSAnimation;
            if (cssAnim.playState === 'running' && cssAnim.animationName) {
              recordName(cssAnim.animationName);
            }
          }
        });
        obs.observe(cardEl, { attributes: true, attributeFilter: ['class', 'data-card-pop'] });
      }
    }, firstCardTestId);

    // 3. Click Expand icon button -> .hl-card fires tactile expand pop animation & CSS transition reveals hidden div
    const firstExpandBtn = firstCard.locator('[data-testid^="expand-exercise-btn-"]');
    await expect(firstExpandBtn).toHaveAttribute('aria-expanded', 'false');
    await firstExpandBtn.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __hlCardPopEvents?: string[] }).__hlCardPopEvents ?? []
        )
      )
      .toContain('hlCardExpandPop');
    await expect(firstExpandBtn).toHaveAttribute('aria-expanded', 'true');
    await expect(detailsPanel).toHaveAttribute('data-expanded', 'true');

    const historyAverageLabel = repWeightHistory.locator(
      '[data-testid^="exercise-history-average-"]'
    );
    await expect(repWeightHistory).toBeVisible();
    await expect(repWeightHistory).toContainText(/No prior history yet|Last:/i);
    await expect(historyAverageLabel).toBeVisible();
    await expect(historyAverageLabel).toHaveText('Average: —');

    // 4. Complete 3 sets with distinct weights (60, 65, 70 -> mean 65), verify Average label & collapse pop
    const targetWeights = ['60', '65', '70'];
    for (let i = 0; i < targetWeights.length; i++) {
      const weightInput = firstCard.getByLabel(`Set ${i + 1} load in kg`);
      await weightInput.fill(targetWeights[i]);
      await firstCard.getByRole('button', { name: `Mark set ${i + 1} complete` }).click();
    }
    await expect(repWeightHistory).toContainText(/Last: Set 1: 60 kg/);
    await expect(historyAverageLabel).toHaveText('Average: 65 kg');

    await firstExpandBtn.click();
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as unknown as { __hlCardPopEvents?: string[] }).__hlCardPopEvents ?? []
        )
      )
      .toContain('hlCardCollapsePop');
    await expect(firstExpandBtn).toHaveAttribute('aria-expanded', 'false');
    await expect(detailsPanel).toHaveAttribute('data-expanded', 'false');
    await expect(repWeightHistory).toBeHidden();
    await assertAllButtonsHaveNoTouchDelay(page, 'Tracker - Re-Collapsed Single-Row .hl-card');
  });

  test('UPG-12: Standalone Android Unified UI & HyperLogNative bridge sync across pages', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const bridgeLog = {
        themes: [] as Array<{ themeId: string; statusHex: string; isDark: boolean }>,
        widgetSnapshots: [] as Array<{ streakDays: number; completedSets: number }>,
        haptics: [] as string[],
        healthConnectOpened: 0,
        widgetPinned: 0,
      };
      (window as unknown as { __nativeBridgeLog?: typeof bridgeLog }).__nativeBridgeLog = bridgeLog;
      (window as unknown as { HyperLogNative?: Record<string, unknown> }).HyperLogNative = {
        isStandaloneApk: () => true,
        syncTheme: (themeId: string, statusHex: string, _navHex: string, isDark: boolean) => {
          bridgeLog.themes.push({ themeId, statusHex, isDark });
        },
        syncWidgetSnapshot: (snapshotJson: string) => {
          try {
            const parsed = JSON.parse(snapshotJson) as {
              streakDays: number;
              completedSets: number;
            };
            bridgeLog.widgetSnapshots.push({
              streakDays: parsed.streakDays,
              completedSets: parsed.completedSets,
            });
          } catch {
            // ignore
          }
        },
        haptic: (kind: string) => {
          bridgeLog.haptics.push(kind);
        },
        setKeepScreenOn: () => {},
        openHealthConnectSettings: () => {
          bridgeLog.healthConnectOpened += 1;
          return true;
        },
        syncWorkoutToHealthConnect: () => JSON.stringify({ ok: true, detail: 'Synced' }),
        requestPinHomeWidget: () => {
          bridgeLog.widgetPinned += 1;
          return true;
        },
      };
    });

    await page.goto('/');

    // 1. Verify initial theme & widget snapshot synced to Android native bridge
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as unknown as {
                __nativeBridgeLog?: { widgetSnapshots: unknown[]; themes: unknown[] };
              }
            ).__nativeBridgeLog?.widgetSnapshots.length ?? 0
        )
      )
      .toBeGreaterThanOrEqual(1);

    // 2. Verify Home Screen Widget deep-link tab selector navigates across pages seamlessly
    await page.evaluate(() => {
      (window as unknown as { __hyperlogSelectNativeTab?: (tab: string) => void }).__hyperlogSelectNativeTab?.(
        'anatomy'
      );
    });
    await expect(page.getByTestId('anatomy-landmarks-dropdown')).toBeVisible();
    // Web-only "Get HyperLog on Your Android Phone (.APK)" banner is automatically hidden inside Standalone APK
    await expect(page.getByText('Get HyperLog on Your Android Phone (.APK)')).toHaveCount(0);

    await page.evaluate(() => {
      (window as unknown as { __hyperlogSelectNativeTab?: (tab: string) => void }).__hyperlogSelectNativeTab?.(
        'settings'
      );
    });
    await expect(
      page.getByText('Native Android Standalone App Active (v4.0.0 · Build 16)')
    ).toBeVisible();

    const hcBtn = page.getByTestId('settings-open-native-health-connect-btn');
    await expect(hcBtn).toBeVisible();
    await hcBtn.click();

    const pinBtn = page.getByTestId('settings-pin-android-widget-btn');
    await expect(pinBtn).toBeVisible();
    await pinBtn.click();

    const counts = await page.evaluate(() => {
      const log = (
        window as unknown as {
          __nativeBridgeLog?: { healthConnectOpened: number; widgetPinned: number };
        }
      ).__nativeBridgeLog;
      return {
        hc: log?.healthConnectOpened ?? 0,
        pin: log?.widgetPinned ?? 0,
      };
    });
    expect(counts.hc).toBe(1);
    expect(counts.pin).toBe(1);
    await assertAllButtonsHaveNoTouchDelay(page, 'Settings - Standalone Android Native Bridge');
  });
});



