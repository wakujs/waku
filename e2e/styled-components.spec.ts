import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('styled-components');

test.describe('styled-components', () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('SSR renders styles without JS', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/`);
    const counterButton = page.getByRole('button', { name: 'Count: 0' });
    await expect(counterButton).toBeVisible();
    await expect(counterButton).toHaveCSS(
      'border-top-color',
      'rgb(255, 165, 0)',
    );
    await page.close();
    await context.close();
  });
});
