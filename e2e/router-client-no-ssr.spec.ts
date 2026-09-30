import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('router-client-no-ssr');

test.describe('router-client-no-ssr', () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    if (stopApp) {
      await stopApp();
    }
  });

  test('renders a route from the fallback shell', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test('direct missing route renders Not Found fallback without /404 page', async ({
    page,
  }) => {
    const rscRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/RSC/R/missing.txt')) {
        rscRequests.push(request.url());
      }
    });
    const pageErrors: Error[] = [];
    page.on('pageerror', (error) => {
      pageErrors.push(error);
    });

    await page.goto(`http://localhost:${port}/missing`);
    await waitForHydration(page);

    await expect(
      page.getByRole('heading', { name: 'Not Found' }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/missing$/);
    expect(rscRequests).toHaveLength(1);
    expect(pageErrors).toEqual([]);
  });
});
