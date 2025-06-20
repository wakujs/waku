import type { PlaywrightTestProject } from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import type { TestOptions } from './e2e/utils.js';

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = defineConfig<TestOptions>({
  testDir: './e2e',
  fullyParallel: true,
  timeout: process.env.CI ? 120_000 : 30_000,
  use: {
    viewport: { width: 1440, height: 800 },
    locale: 'en-US',
    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    // You can open traces locally(`npx playwright show-trace trace.zip`)
    // or in your browser on [Playwright Trace Viewer](https://trace.playwright.dev/).
    trace: 'on-first-retry',
    // Record video only when retrying a test for the first time.
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ].flatMap<PlaywrightTestProject<TestOptions>>((item) => [
    {
      ...item,
      name: `${item.name}-dev`,
      testIgnore: ['examples-smoke.spec.ts'],
      use: {
        ...item.use,
        mode: 'DEV',
      },
    },
    {
      ...item,
      name: `${item.name}-prd`,
      testIgnore: ['examples-smoke.spec.ts'],
      use: {
        ...item.use,
        mode: 'PRD',
      },
    },
  ]),
  forbidOnly: !!process.env.CI,
  workers: process.env.CI ? 1 : 3,
  retries: 0,
  // 'github' for GitHub Actions CI to generate annotations, plus a concise 'dot'
  // default 'list' when running locally
  // See https://playwright.dev/docs/test-reporters#github-actions-annotations
  reporter: process.env.CI ? 'github' : 'list',
});

export default config;
