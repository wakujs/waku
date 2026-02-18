import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('router-client');

test.describe('router-client', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('popstate interceptor can block navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');

    await page.evaluate(() => {
      window.history.pushState({}, '', '/ignored?__interceptor=block');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
  });

  test('popstate interceptor can rewrite navigation target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.history.pushState({}, '', '/ignored?__interceptor=rewrite');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(
      page.getByRole('heading', { name: 'Intercepted' }),
    ).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/intercepted');
    await expect(page.getByTestId('route-query')).toHaveText(
      'from=interceptor',
    );
  });

  test('route fetch includes X-Waku-Router-Skip header', async ({ page }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    const nextRscRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/RSC/R/next.txt') && request.method() === 'GET',
    );
    await page.getByTestId('go-next').click();
    const request = await nextRscRequestPromise;

    const skipHeader = request.headers()['x-waku-router-skip'];
    expect(skipHeader).toBeTruthy();
    const skippedIds = JSON.parse(skipHeader as string) as unknown;
    expect(Array.isArray(skippedIds)).toBe(true);
    expect((skippedIds as unknown[]).length).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('x=1');
  });

  test('unstable_prefetchOnView triggers prefetch when link enters viewport', async ({
    page,
  }) => {
    const prefetchedViewRequests: string[] = [];
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (
        request.method() === 'GET' &&
        requestUrl.includes('/RSC/R/view-target.txt')
      ) {
        prefetchedViewRequests.push(requestUrl);
      }
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    expect(prefetchedViewRequests).toHaveLength(0);

    await page.getByTestId('prefetch-on-view-link').scrollIntoViewIfNeeded();
    await expect.poll(() => prefetchedViewRequests.length).toBeGreaterThan(0);
    const afterPrefetchCount = prefetchedViewRequests.length;

    await page.getByTestId('prefetch-on-view-link').click();
    await expect(
      page.getByRole('heading', { name: 'View Target' }),
    ).toBeVisible();
    expect(prefetchedViewRequests.length).toBe(afterPrefetchCount);
  });

  test('client notFound navigation uses /404 page content when present', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-trigger-not-found').click();

    await expect(
      page.getByRole('heading', { name: 'Custom 404' }),
    ).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/404');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page).toHaveURL(/\/trigger-not-found$/);
  });

  test('client redirect navigation resolves to target and replaces history entry', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-trigger-redirect').click();

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('from=redirect');
    await expect(page).toHaveURL(/\/next\?from=redirect$/);

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page).toHaveURL(/\/start$/);
  });

  test('client navigation to missing route with /404 page renders /404 content', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-missing').click();

    await expect(
      page.getByRole('heading', { name: 'Custom 404' }),
    ).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/404');
    await expect(page).toHaveURL(/\/start$/);
  });
});
