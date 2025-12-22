import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('ssr-context-provider');

test.describe(`ssr-context-provider`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('show context value', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await page.waitForSelector('[data-testid="mounted"]');
    await expect(page.getByTestId('value')).toHaveText('provider value');
  });

  test('no js environment', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('value')).toHaveText('provider value');
    await page.close();
    await context.close();
  });
});
