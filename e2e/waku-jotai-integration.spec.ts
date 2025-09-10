import { expect } from '@playwright/test';

import { test, waitForHydration, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('waku-jotai-integration');

test.describe('waku-jotai', async () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('double count', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await expect(page.getByTestId('count')).toHaveText('[count=1]');
    await expect(page.getByTestId('double-count')).toHaveText(
      '[doubleCount=2]',
    );
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('[count=2]');
    await expect(page.getByTestId('double-count')).toHaveText(
      '[doubleCount=4]',
    );
  });
});
