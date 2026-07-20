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
    page.on('request', (req) => pendingRequests.set(req.url(), 'no-response'));
    page.on('response', (res) =>
      pendingRequests.set(res.url(), `body-open ${res.status()}`),
    );
    page.on('requestfinished', (req) =>
      pendingRequests.set(
        req.url(),
        (pendingRequests.get(req.url()) ?? '').replace('body-open', 'done'),
      ),
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
      (window as unknown as { __diagBodies: string[] }).__diagBodies = [];
      const origFetch = window.fetch.bind(window);
      window.fetch = async (...args) => {
        const url = String(args[0] instanceof Request ? args[0].url : args[0]);
        const index = fetches.push(`${url} ...`) - 1;
        try {
          const res = await origFetch(...args);
          if (url.includes('/RSC/')) {
            res
              .clone()
              .text()
              .then(
                (text) => {
                  fetches[index] =
                    `${url} ${res.status} body[${text.length}] hasSlot=${text.includes('route:/')}`;
                  (
                    window as unknown as { __diagBodies: string[] }
                  ).__diagBodies.push(`${url}\n${text}`);
                },
                () => {
                  fetches[index] = `${url} ${res.status} body unread`;
                },
              );
          } else {
            fetches[index] = `${url} ${res.status}`;
          }
          return res;
        } catch (e) {
          fetches[index] = `${url} threw ${e}`;
          throw e;
        }
      };
    });
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      const summary = await page.evaluate(() => {
        const scripts = [...document.scripts].map((el) => el.textContent || '');
        const rows = scripts.filter((t) =>
          t.trimStart().startsWith('(self.__FLIGHT_DATA'),
        );
        const rowKinds = rows.map((t) => {
          const m = t.match(/push\("(.*)"\)/s);
          const text = m ? m[1]!.replace(/\\n/g, '\n') : '';
          return text
            .split('\n')
            .map((line) => (line.match(/^([0-9a-f]+:.)/) || [])[1])
            .filter((kind) => kind !== undefined)
            .join(' ');
        });
        return {
          rowKinds,
          bodyChildren: [...document.body.children].map(
            (el) =>
              `${el.tagName.toLowerCase()}:${(el.textContent || '').length}`,
          ),
          location:
            window.location.pathname +
            window.location.search +
            window.location.hash,
          readyState: document.readyState,
          headings: document.querySelectorAll('h1,h2,h3').length,
          flightRowScripts: rows.length,
          flightHasLocation: rows.some((t) => t.includes('location')),
          flightHasDestination: rows.some((t) => t.includes('destination')),
          fetches: (window as unknown as { __diagFetches?: string[] })
            .__diagFetches,
        };
      });
      const recovery = await page.evaluate(async () => {
        const g = globalThis as unknown as {
          __WAKU_REFETCH_ROUTE__?: () => void;
          __WAKU_RSC_RELOAD_LISTENERS__?: unknown[];
        };
        const before = {
          refetchRoute: typeof g.__WAKU_REFETCH_ROUTE__,
          listeners: g.__WAKU_RSC_RELOAD_LISTENERS__?.length ?? 0,
        };
        g.__WAKU_REFETCH_ROUTE__?.();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        return {
          ...before,
          headingAfterRefetch:
            document.querySelector('h1')?.textContent ?? null,
        };
      });
      await testInfo.attach('recovery-probe', {
        body: JSON.stringify(recovery),
      });
      const stillPending = [...pendingRequests.entries()]
        .filter(([, state]) => !state.startsWith('done'))
        .map(([url, state]) => `${state} ${url}`);
      await testInfo.attach('summary', {
        body: [
          JSON.stringify(summary),
          'pending: ' + JSON.stringify(stillPending),
        ].join('\n'),
      });
      const bodies = await page.evaluate(
        () =>
          (window as unknown as { __diagBodies?: string[] }).__diagBodies ?? [],
      );
      await testInfo.attach('rsc-bodies', { body: bodies.join('\n---\n') });
      const flightRows = await page.evaluate(() =>
        [...document.scripts]
          .map((el) => el.textContent || '')
          .filter((text) => text.trimStart().startsWith('(self.__FLIGHT_DATA'))
          .join('\n---\n'),
      );
      await testInfo.attach('flight-rows', { body: flightRows });
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
