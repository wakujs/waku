import { expect } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('router-client');
const allowedConsoleErrorPatterns: RegExp[] = [
  /An error occurred in the Server Components render\./,
  /Error:\s+Not Found/,
  /Error:\s+Redirect/,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/,
  /Error: 404 Not Found/,
];
const isAllowedConsoleError = (text: string) =>
  allowedConsoleErrorPatterns.some((pattern) => pattern.test(text));
const expectedErrorFlowConsolePatterns: RegExp[] = [
  /The above error occurred in the <TriggerNotFoundPage> component\./,
  /The above error occurred in the <TriggerRedirectPage> component\./,
  /The above error occurred in the <ThrowError> component\./,
  /React will try to recreate this component tree from scratch using the error boundary you provided, CustomErrorHandler\./,
  /^Error$/,
];
const dropExpectedErrorFlowConsoleErrors = (errors: string[]): string[] =>
  errors.filter(
    (text) =>
      !expectedErrorFlowConsolePatterns.some((pattern) => pattern.test(text)),
  );

test.describe('router-client', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let consoleErrors: string[];
  let consoleHandler: ((msg: ConsoleMessage) => void) | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    consoleHandler = (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    page.on('console', consoleHandler);
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test.afterEach(async ({ page }) => {
    if (consoleHandler) {
      page.off('console', consoleHandler);
    }
    const unexpectedErrors = consoleErrors.filter(
      (text) => !isAllowedConsoleError(text),
    );
    expect(unexpectedErrors).toEqual([]);
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

  test('hash-only link navigation scrolls to anchor target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      const scrollToCalls: ScrollToOptions[] = [];
      (window as unknown as Record<string, unknown>).__scrollToCalls =
        scrollToCalls;
      const originalScrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((options: ScrollToOptions | number, top?: number) => {
        if (typeof options === 'number') {
          scrollToCalls.push({ left: options, top: top ?? 0 });
          originalScrollTo(options, top ?? 0);
          return;
        }
        scrollToCalls.push(options);
        originalScrollTo(options);
      }) as typeof window.scrollTo;
    });

    await page.getByTestId('router-push-hash-target').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page.getByTestId('route-hash')).toHaveText('#scroll-target');
    await expect(page).toHaveURL(/\/start#scroll-target$/);
    const scrollToCalls = (await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>)
          .__scrollToCalls as ScrollToOptions[],
    )) as ScrollToOptions[];
    const lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.left).toBe(0);
    expect(lastScrollToCall?.top).toBeGreaterThan(100);
  });

  test('query-only link navigation preserves current scroll position by default', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await page.evaluate(() => {
      const scrollToCalls: ScrollToOptions[] = [];
      (window as unknown as Record<string, unknown>).__scrollToCalls =
        scrollToCalls;
      const originalScrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((options: ScrollToOptions | number, top?: number) => {
        if (typeof options === 'number') {
          scrollToCalls.push({ left: options, top: top ?? 0 });
          originalScrollTo(options, top ?? 0);
          return;
        }
        scrollToCalls.push(options);
        originalScrollTo(options);
      }) as typeof window.scrollTo;
    });

    await page.getByTestId('router-push-query-only').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('from=query-only');
    await expect(page.getByTestId('route-hash')).toHaveText('');
    await expect(page).toHaveURL(/\/start\?from=query-only$/);
    const scrollToCalls = (await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>)
          .__scrollToCalls as ScrollToOptions[],
    )) as ScrollToOptions[];
    expect(scrollToCalls).toHaveLength(0);
  });

  test('path-change link navigation resets scroll position to top by default', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await page.evaluate(() => {
      const scrollToCalls: ScrollToOptions[] = [];
      (window as unknown as Record<string, unknown>).__scrollToCalls =
        scrollToCalls;
      const originalScrollTo = window.scrollTo.bind(window);
      window.scrollTo = ((options: ScrollToOptions | number, top?: number) => {
        if (typeof options === 'number') {
          scrollToCalls.push({ left: options, top: top ?? 0 });
          originalScrollTo(options, top ?? 0);
          return;
        }
        scrollToCalls.push(options);
        originalScrollTo(options);
      }) as typeof window.scrollTo;
    });

    await page.getByTestId('router-push-next').click();

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('x=1');
    await expect(page.getByTestId('route-hash')).toHaveText('');
    await expect(page).toHaveURL(/\/next\?x=1$/);
    const scrollToCalls = (await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>)
          .__scrollToCalls as ScrollToOptions[],
    )) as ScrollToOptions[];
    const lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.left).toBe(0);
    expect(lastScrollToCall?.top).toBe(0);
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

  test('unstable_prefetchOnEnter triggers prefetch on hover', async ({
    page,
  }) => {
    const prefetchedEnterRequests: string[] = [];
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (
        request.method() === 'GET' &&
        requestUrl.includes('/RSC/R/next.txt')
      ) {
        prefetchedEnterRequests.push(requestUrl);
      }
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    expect(prefetchedEnterRequests).toHaveLength(0);

    await page.getByTestId('prefetch-on-enter-link').hover();
    await expect.poll(() => prefetchedEnterRequests.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
  });

  test('unstable_pending and unstable_notPending reflect async transition state', async ({
    page,
  }) => {
    await page.route('**/RSC/R/next.txt**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    await expect(page.getByTestId('not-pending-indicator')).toBeVisible();

    await page.getByTestId('pending-link').click();
    await expect(page.getByTestId('pending-indicator')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('pending-indicator')).toHaveCount(0);
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
    consoleErrors = dropExpectedErrorFlowConsoleErrors(consoleErrors);
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
    consoleErrors = dropExpectedErrorFlowConsoleErrors(consoleErrors);
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
    consoleErrors = dropExpectedErrorFlowConsoleErrors(consoleErrors);
  });
});
