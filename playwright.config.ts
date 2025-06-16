import type {
  PlaywrightTestProject,
  PlaywrightWorkerOptions,
} from '@playwright/test';
import { defineConfig, devices } from '@playwright/test';
import type { TestOptions } from './e2e/utils.js';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// require('dotenv').config();

/**
 * See https://playwright.dev/docs/test-configuration.
 */
const config = defineConfig<TestOptions>({
  testDir: './e2e',
  fullyParallel: true,
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: {
    timeout: process.env.CI ? 10_000 : 5_000,
  },
  use: {
    browserName:
      (process.env.BROWSER as PlaywrightWorkerOptions['browserName']) ??
      'chromium',
    viewport: { width: 1440, height: 800 },
    actionTimeout: process.env.CI ? 10_000 : 5_000,
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

if (process.env.CI) {
  config.retries = 3;
}

export default config;
