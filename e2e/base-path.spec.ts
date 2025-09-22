import { expect } from '@playwright/test';

import { test, prepareNormalSetup, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('base-path');

test.describe(`base-path`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      cmd: mode === 'DEV' ? 'pnpm dev' : 'pnpm start-static',
    }));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/custom/base/`);
    await waitForHydration(page);

    // client component
    await expect(page.getByTestId('client-counter')).toHaveText('Count: 0');
    await page.getByTestId('client-counter').click();
    await expect(page.getByTestId('client-counter')).toHaveText('Count: 1');

    // style
    await expect(page.locator('.test-style')).toHaveCSS(
      'color',
      'rgb(255, 150, 0)',
    );

    // client side navigation
    await page.getByRole('link', { name: 'About' }).click();
    await page.waitForURL(`http://localhost:${port}/custom/base/about`);
    await expect(
      page.getByRole('heading', { name: 'About page' }),
    ).toBeVisible();

    // ssr
    await page.goto(`http://localhost:${port}/custom/base/about`);
    await expect(
      page.getByRole('heading', { name: 'About page' }),
    ).toBeVisible();
  });
});
