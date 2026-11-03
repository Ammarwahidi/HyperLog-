import fs from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

const preinstalledHeadlessShell =
  '/ms-playwright/chrome-headless-shell-linux64/chrome-headless-shell';
const resolvedExecPath =
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
  (fs.existsSync(preinstalledHeadlessShell) ? preinstalledHeadlessShell : undefined);

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(resolvedExecPath ? { launchOptions: { executablePath: resolvedExecPath } } : {}),
  },
  projects: [
    {
      name: 'desktop-chromium-clay',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'android-mobile-clay',
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
