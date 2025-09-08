import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('tailwindcss');

test.describe(`tailwindcss`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('test-server')).toHaveCSS(
      'text-decoration-style',
      'dashed',
    );
    await expect(page.getByText('test-client')).toHaveCSS(
      'text-decoration-style',
      'double',
    );
  });
});
