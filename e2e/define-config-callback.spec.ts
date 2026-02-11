import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('define-config-callback');

test.describe('define-config-callback', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('callback config resolves command and mode in DEV', async ({
    page,
    mode,
  }) => {
    test.skip(mode !== 'DEV');
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('command')).toHaveText('dev');
    await expect(page.getByTestId('mode')).toHaveText('development');
  });

  test('callback config resolves for build and start in PRD', async ({
    page,
    mode,
  }) => {
    test.skip(mode !== 'PRD');
    // Verifies the callback config was resolved successfully for both
    // `waku build` (command=build) and `waku start` (command=start).
    // Page content reflects build-time values since define is baked at build.
    await page.goto(`http://localhost:${port}/`);
    await expect(
      page.getByRole('heading', { name: 'Define Config Callback Test' }),
    ).toBeVisible();
  });
});
