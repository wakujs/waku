import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('rsc-asset');

test.describe(`rsc-asset`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ page, mode }) => {
    ({ port, stopApp } = await startApp(page, mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    // server asset
    await expect(page.getByTestId('server-file')).toContainText(
      'server asset: test-server-ok',
    );

    // client asset
    await page.getByTestId('client-link').click();
    await page.getByText('test-client-ok').click();
  });
});
