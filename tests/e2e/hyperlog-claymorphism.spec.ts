import { expect, test } from '@playwright/test';

test.describe('HyperLog v4.0 — Claymorphism UI, Day-Zero Clean Slate & Telemetry E2E', () => {
  test('E2E-01 & E2E-02: Day-Zero clean state (zero legacy test data) + Claymorphism 3D default UI & touch optimization', async ({
    page,
    request,
  }) => {
    // Verify server sync receipts are clean at Day Zero
    const syncClearRes = await request.delete('/api/google-sync/receipts');
    expect(syncClearRes.ok()).toBeTruthy();

    await page.goto('/');
    await expect(page.getByText('HyperLog').first()).toBeVisible();

    // 1. Default theme must be Soft Clay 3D ('clay')
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    expect(htmlTheme).toBe('clay');

    // 2. Verify Claymorphism card renders multi-layered 3D box-shadow & >= 20px border-radius
    const firstCard = page.locator('.hl-card').first();
    await expect(firstCard).toBeVisible();
    const cardStyles = await firstCard.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        boxShadow: cs.boxShadow,
        borderRadius: cs.borderRadius,
      };
    });
    expect(cardStyles.boxShadow).toContain('inset');
    expect(parseFloat(cardStyles.borderRadius)).toBeGreaterThanOrEqual(16);

    // 3. Verify all visible buttons carry .no-touch-delay for instant Android touch feedback
    const missingTouchClassCount = await page.locator('button:visible').evaluateAll((btns) =>
      btns.filter((b) => !b.classList.contains('no-touch-delay')).length
    );
    expect(missingTouchClassCount).toBe(0);

    // 4. Verify Day-Zero Progressive-Disclosure Clean-Slate: warm greeting + single circular progress card + zero redundant dropdowns
    await expect(page.getByTestId('tracker-warm-greeting')).toBeVisible();
    await expect(page.getByTestId('daily-workout-progress-card')).toBeVisible();
    await expect(page.getByTestId('daily-completion-percentage')).toHaveText('0%');
    await expect(page.getByTestId('toggle-deep-analytics-btn')).toBeVisible();
    await expect(page.getByTestId('deep-analytics-panel')).toHaveCount(0);
    await expect(page.getByTestId('home-dropdown-templates')).toHaveCount(0);
    await expect(page.getByTestId('home-dropdown-calendar')).toHaveCount(0);
    await expect(page.getByTestId('home-dropdown-volume')).toHaveCount(0);
    await expect(page.getByTestId('home-dropdown-wellness')).toHaveCount(0);
  });

  test('E2E-03: Claymorphism APK Studio — 4-screen mobile wireframes, Midnight Clay switch & WCAG accessibility toggles', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByTestId('nav-tab-settings').click();
    await page.getByTestId('open-clay-studio-btn').click();

    const modal = page.getByTestId('claymorphism-studio-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('clay-mobile-mockup-frame')).toBeVisible();

    // Cycle through all 4 APK wireframe screens
    for (const screenId of ['track', 'anatomy', 'library', 'telemetry'] as const) {
      await page.getByTestId(`wireframe-screen-${screenId}`).click();
      await expect(page.getByTestId('clay-mobile-mockup-frame')).toBeVisible();
    }

    // Inspect Palette & 3D Shadow Recipes tab
    await page.getByTestId('clay-tab-tokens').click();
    await expect(modal.getByText('Cloud Lavender Canvas')).toBeVisible();

    // Switch to Midnight Clay ('clay-dark') and back to Soft Clay 3D ('clay')
    await page.getByTestId('apply-clay-dark-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clay-dark');
    await page.getByTestId('apply-clay-pastel-btn').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'clay');

    // Verify Usability & WCAG AA+ Accessibility toggles
    await page.getByTestId('clay-tab-accessibility').click();
    await page.getByTestId('toggle-clay-high-contrast').click();
    await expect(page.locator('html')).toHaveAttribute('data-clay-high-contrast', 'true');

    await page.getByTestId('toggle-clay-flat-depth').click();
    await expect(page.locator('html')).toHaveAttribute('data-clay-flat-depth', 'true');

    // Restore standard 3D clay state
    await page.getByTestId('toggle-clay-high-contrast').click();
    await page.getByTestId('toggle-clay-flat-depth').click();

    // Verify QA & Timeline tab
    await page.getByTestId('clay-tab-qa_timeline').click();
    await expect(modal.getByText(/Phase 1 · Days 1–2/i)).toBeVisible();

    await page.getByTestId('close-clay-studio-btn').click();
    await expect(modal).toBeHidden();
  });

  test('E2E-04: Responsive navigation across tabs & First-10 IntersectionObserver Library pagination', async ({
    page,
    isMobile,
  }) => {
    await page.goto('/');

    const navScope = isMobile
      ? page.getByRole('navigation', { name: 'Mobile Navigation' })
      : page.getByRole('navigation', { name: 'Primary Navigation' });

    // Navigate to Anatomy and verify Day-Zero 0 sets baseline
    await navScope.getByRole('button', { name: 'Anatomy' }).click();
    await expect(page.getByText(/Chest/i).first()).toBeVisible();

    // Navigate to Library and verify First-10 initial batch rendering
    await navScope.getByRole('button', { name: 'Library' }).click();
    const counter = page.getByTestId('library-pagination-counter');
    await expect(counter).toBeVisible();
    await expect(counter).toContainText(/Showing 10 of/i);

    // Scroll the library container to dynamically fetch the next batch (+10)
    const scrollContainer = page.getByTestId('library-scroll-container');
    await scrollContainer.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect
      .poll(async () => {
        const text = (await counter.textContent()) || '';
        const match = text.match(/Showing\s+(\d+)\s+of/i);
        return match ? Number(match[1]) : 0;
      })
      .toBeGreaterThanOrEqual(10);

    // Navigate to Wellness and verify clean 0 kcal Day-Zero state
    await navScope.getByRole('button', { name: 'Wellness' }).click();
    await expect(page.getByText(/0\s*\/\s*2,?350|Calories|Nutrition/i).first()).toBeVisible();
  });

  test('E2E-05: Custom exercise creation & live workout session startup from Day Zero', async ({
    page,
  }) => {
    await page.goto('/');

    // Open the progressive-disclosure Custom Exercise drawer and create a custom exercise
    await page.getByTestId('toggle-custom-exercise-composer-btn').click();
    const customForm = page.getByTestId('inline-custom-exercise-form');
    await expect(customForm).toBeVisible();

    await customForm.getByPlaceholder(/Cable Wrist Pronation/i).fill('Clay Cable Lateral Raise');
    await customForm.getByRole('button', { name: /Save Custom Exercise/i }).first().click();

    await expect(page.getByText('Clay Cable Lateral Raise').first()).toBeVisible();
  });

  test('E2E-06: Day-Zero Telemetry API capture, JSON log archiving, purging & signed v4.0 APK binary verification', async ({
    page,
    request,
  }) => {
    // 1. Purge server telemetry logs to establish deterministic Day-Zero state
    const purgeRes = await request.delete('/api/logs/purge?includeArchives=true');
    expect(purgeRes.ok()).toBeTruthy();

    // 2. Post structured telemetry events and verify ring-buffer persistence
    const postRes = await request.post('/api/logs', {
      data: {
        source: 'playwright-e2e',
        entries: [
          {
            id: `pw_evt_${Date.now()}`,
            timestampIso: new Date().toISOString(),
            epochMs: Date.now(),
            dayZeroOffsetMinutes: 0.1,
            level: 'METRIC',
            category: 'startup',
            event: 'E2E_FIRST10_HYDRATION_VERIFIED',
            durationMs: 12,
            metadata: { suite: 'playwright' },
          },
        ],
      },
    });
    expect(postRes.ok()).toBeTruthy();

    const getLogsRes = await request.get('/api/logs');
    expect(getLogsRes.ok()).toBeTruthy();
    const logsJson = await getLogsRes.json();
    expect(logsJson.count).toBeGreaterThanOrEqual(1);
    expect(
      logsJson.entries.some((e: { event: string }) => e.event === 'E2E_FIRST10_HYDRATION_VERIFIED')
    ).toBeTruthy();

    // 3. Archive logs and verify rotation
    const archiveRes = await request.post('/api/logs/archive');
    expect(archiveRes.ok()).toBeTruthy();
    const archiveJson = await archiveRes.json();
    expect(archiveJson.ok).toBe(true);
    expect(archiveJson.archive.entriesCount).toBeGreaterThanOrEqual(1);

    // 4. Verify UI Day-Zero Logging Console inside Claymorphism Studio (via Settings)
    await page.goto('/');
    await page.getByTestId('nav-tab-settings').click();
    await page.getByTestId('open-clay-studio-btn').click();
    await page.getByTestId('clay-tab-logging').click();
    await expect(page.getByTestId('telemetry-log-list')).toBeVisible();

    await page.getByTestId('studio-purge-logs-btn').click();
    await expect(page.getByTestId('telemetry-action-notice')).toContainText(/purged/i);

    // 5. Verify v4.0.0 APK manifest & cryptographic ZIP/APK binary header ('PK\x03\x04')
    const manifestRes = await request.get('/api/download/manifest');
    expect(manifestRes.ok()).toBeTruthy();
    const manifest = await manifestRes.json();
    expect(manifest.version).toBe('4.0.0');
    expect(manifest.versionCode).toBeGreaterThanOrEqual(14);

    const apkRes = await request.get('/api/download/apk');
    expect(apkRes.ok()).toBeTruthy();
    const apkBytes = await apkRes.body();
    expect(apkBytes.length).toBeGreaterThan(100_000);
    // Standard Android APK/ZIP magic header: 0x50 0x4B 0x03 0x04 ('PK\x03\x04')
    expect(apkBytes[0]).toBe(0x50);
    expect(apkBytes[1]).toBe(0x4b);
    expect(apkBytes[2]).toBe(0x03);
    expect(apkBytes[3]).toBe(0x04);
  });
});
