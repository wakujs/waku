import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe('router route intent reference preservation', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('preserves an opaque client object through an action and route render', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/temporary-reference`);
    await waitForHydration(page);
    await expect(page.getByText('Waiting for object')).toBeVisible();
    await page.getByRole('button', { name: 'Round trip' }).click();
    await expect(page.getByText('Original object received')).toBeVisible();
  });

  test('refetches a dynamic page redirect under a static layout', async ({
    page,
  }) => {
    let requestCount = 0;
    page.on('request', (request) => {
      if (request.url().includes('/RSC/R/mixed/gate')) {
        requestCount++;
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Mixed Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Home Page' }),
    ).toBeVisible();
    const previousRequestCount = requestCount;
    await page.getByRole('link', { name: 'Mixed Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
    expect(requestCount).toBeGreaterThan(previousRequestCount);
  });
});
