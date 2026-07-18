import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  const pageLogs: string[] = [];
  const pendingRequests = new Map<string, string>();
  test.beforeEach(async ({ page }) => {
    pageLogs.length = 0;
    pendingRequests.clear();
    page.on('console', (msg) => pageLogs.push(msg.text()));
    page.on('pageerror', (err) => pageLogs.push(`pageerror: ${err}`));
    page.on('request', (req) => pendingRequests.set(req.url(), 'pending'));
    page.on('response', (res) =>
      pendingRequests.set(res.url(), String(res.status())),
    );
    page.on('requestfailed', (req) =>
      pendingRequests.set(
        req.url(),
        `failed ${req.failure()?.errorText ?? ''}`,
      ),
    );
    await page.addInitScript(() => {
      const fetches: string[] = [];
      (window as unknown as { __diagFetches: string[] }).__diagFetches =
        fetches;
      const origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const url = String(args[0] instanceof Request ? args[0].url : args[0]);
        fetches.push(`fetch ${url} ...`);
        try {
          const res = await origFetch(...args);
          fetches.push(`fetch ${url} ${res.status}`);
          return res;
        } catch (e) {
          fetches.push(`fetch ${url} threw ${e}`);
          throw e;
        }
      };
    });
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const summary = await page.evaluate(() => {
        const scripts = [...document.scripts].map((el) => el.textContent || '');
        const rows = scripts.filter((t) => t.includes('__FLIGHT_DATA'));
        return {
          readyState: document.readyState,
          headings: document.querySelectorAll('h1,h2,h3').length,
          flightRowScripts: rows.length,
          flightHasLocation: rows.some((t) => t.includes('location')),
          flightHasDestination: rows.some((t) => t.includes('destination')),
          fetches: (window as unknown as { __diagFetches?: string[] })
            .__diagFetches,
        };
      });
      const stillPending = [...pendingRequests.entries()]
        .filter(([, state]) => state === 'pending')
        .map(([url]) => url);
      await testInfo.attach('summary', {
        body: [
          JSON.stringify(summary, null, 1),
          'pending: ' + JSON.stringify(stillPending),
        ].join('\n'),
      });
      await testInfo.attach('page-console', { body: pageLogs.join('\n') });
      await testInfo.attach('page-network', {
        body: [...pendingRequests.entries()]
          .map(([url, state]) => `${state} ${url}`)
          .join('\n'),
      });
      await testInfo.attach('page-html', {
        body: await page.content(),
        contentType: 'text/html',
      });
      await testInfo.attach('server-output', {
        body: serverOutput.join('').slice(-20000),
      });
    }
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access sync page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/sync']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/async']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action (no js)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
