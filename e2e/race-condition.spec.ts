import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('race-condition');

test.describe('race-condition', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('race-condition-use-router', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    await page.goto(`http://localhost:${port}`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await waitForHydration(page);

    await page.getByRole('button', { name: 'Fast Navigate' }).click();

    await expect(page).toHaveURL(`http://localhost:${port}/bar`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeHidden();
    await expect(page.getByRole('heading', { name: 'Bar' })).toBeVisible();

    expect(messages.some((msg) => msg.includes('Uncaught'))).toBe(false);
  });
});
