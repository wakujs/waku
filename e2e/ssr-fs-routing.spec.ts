import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-fs-routing');

test.describe(`ssr-fs-routing`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('access home page', async ({ page }) => {
    const res = await page.goto(`http://localhost:${port}/`);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Home Page' }),
    ).toBeVisible();
  });

  test('access nested page', async ({ page }) => {
    const res = await page.goto(`http://localhost:${port}/nested`);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Nested Page' }),
    ).toBeVisible();
  });

  test('access found page', async ({ page }) => {
    const res = await page.goto(`http://localhost:${port}/found`);
    expect(res?.status()).toBe(200);
    await expect(
      page.getByRole('heading', { name: 'Found Page' }),
    ).toBeVisible();
  });

  test('access not found page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByText('Not found page (404)').click();
    await expect(
      page.getByRole('heading', { name: 'Not Found' }),
    ).toBeVisible();
  });
});
