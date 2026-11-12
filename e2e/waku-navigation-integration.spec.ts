import { type Page, type Request, expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('waku-navigation-integration');

// The late redirect resolves when its page's RSC stream ends; the request
// can report that as finished or as aborted.
const waitForLateRedirect = (page: Page) => {
  const predicate = (request: Request) =>
    new URL(request.url()).pathname === '/RSC/R/late-redirect.txt';
  const ended = [
    page.waitForEvent('requestfinished', { predicate }),
    page.waitForEvent('requestfailed', { predicate }),
  ];
  for (const event of ended) {
    event.catch(() => {});
  }
  return Promise.race(ended);
};

const waitForFrames = (page: Page) =>
  page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );

test.describe('waku-navigation', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('initial render', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home')).toHaveText('Home');
  });

  test('anchor navigation goes through the navigate event', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello nav');
    await expect(page).toHaveURL(/\/hello\/nav$/);
  });

  test('a missing route follows the 404 page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-missing').click();
    await expect(page.getByTestId('not-found')).toHaveText('Custom 404');
  });

  test('useParams and useSearch work under waku-navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/hello/nav`);
    await waitForHydration(page);
    await expect(page.getByTestId('params')).toHaveText('nav');
    await page.getByTestId('go-search').click();
    await expect(page.getByTestId('search')).toHaveText('hi');
  });

  test('a lazy Slice renders', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-slice').click();
    await expect(page.getByTestId('slice-clock')).toHaveText('lazy clock');
  });

  test('returning to a static route keeps URL and content in sync', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-static').click();
    await expect(page.getByTestId('static')).toHaveText('Static');
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello nav');
    await page.getByTestId('go-static').click();
    await expect(page).toHaveURL(/\/static$/);
    await expect(page.getByTestId('static')).toHaveText('Static');
  });

  test('setSearch keeps the hash after a hash-only navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.getByTestId('hash-a').click();
    await expect(page).toHaveURL(/\/search\?q=hi#a$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#a');
    await page.getByTestId('hash-b').click();
    await expect(page).toHaveURL(/\/search\?q=hi#b$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#b');
    await page.getByTestId('set-search').click();
    await expect(page).toHaveURL(/\/search\?q=x#b$/);
    await expect(page.getByTestId('search')).toHaveText('x');
  });

  test('an internal redirect updates the address bar', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-old').click();
    await expect(page.getByTestId('redirect-new')).toHaveText('New');
    await expect(page).toHaveURL(/\/new$/);
  });

  test('a completed redirect does not interrupt the next navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.evaluate(async () => {
      await window.navigation.navigate('/old').finished;
      await window.navigation.navigate('/hello/nav').finished;
    });
    await expect(page.getByTestId('hello')).toHaveText('Hello nav');
    await expect(page).toHaveURL(/\/hello\/nav$/);
  });

  test('a same-path query redirect renders the target', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-canonical').click();
    await expect(page.getByTestId('canonical')).toHaveText('Canonical new');
    await expect(page).toHaveURL(/\/canonical\?v=new$/);
  });

  test('a hash-only slot redirect surfaces a follow error', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hash-only').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'detected a navigation loop',
    );
    await expect(page).toHaveURL(/\/hash-only$/);
  });

  test('a query redirect cycle stops at the follow limit', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-bounce').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'too many redirect or 404 follows',
      { timeout: 30_000 },
    );
    await expect(page).toHaveURL(/\/bounce\?v=[ab]$/);
  });

  test('fresh same-query intents share the follow budget', async ({ page }) => {
    let mixBFetches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/RSC/R/mix-b.txt') {
        mixBFetches += 1;
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-mix-budget-same').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'too many redirect or 404 follows',
      { timeout: 30_000 },
    );
    expect(mixBFetches).toBe(10);
  });

  test('redirect and not-found intents share the follow limit', async ({
    page,
  }) => {
    let mixBFetches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/RSC/R/mix-b.txt') {
        mixBFetches += 1;
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-mix-budget').click();
    await expect(page.getByTestId('follow-error')).toHaveText(
      'too many redirect or 404 follows',
      { timeout: 30_000 },
    );
    expect(mixBFetches).toBe(10);
  });

  test('setSearch does not reset scroll', async ({ page }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await page.getByTestId('set-search').evaluate((el: HTMLButtonElement) => {
      el.click();
    });
    await expect(page.getByTestId('search')).toHaveText('x');
    await page.evaluate(() => window.navigation.transition?.finished);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('a fragment link to another route scrolls to the target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-fragment-target').click();
    await expect(page).toHaveURL(/\/fragment-target#comments$/);
    await expect(page.getByTestId('comments')).toBeInViewport();
  });

  test('an action rerenders the route it was called from', async ({ page }) => {
    await page.goto(`http://localhost:${port}/rerender-action`);
    await waitForHydration(page);
    const count = page.getByTestId('rerender-count');
    const before = Number(await count.textContent());
    await page.getByTestId('rerender').click();
    await expect(count).toHaveText(String(before + 1));
    await expect(page).toHaveURL(/\/rerender-action$/);
  });

  test('an action rerenders the 404 page it was called from', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-missing').click();
    await expect(page.getByTestId('not-found')).toHaveText('Custom 404');
    const count = page.getByTestId('not-found-count');
    const before = Number(await count.textContent());
    await page.getByTestId('not-found-rerender').click();
    await expect(count).toHaveText(String(before + 1));
    await expect(page).toHaveURL(/\/missing$/);
  });

  test('an action that renders another route moves the address bar', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/rerender-action`);
    await waitForHydration(page);
    await page.getByTestId('render-static').click();
    await expect(page.getByTestId('static')).toHaveText('Static');
    await expect(page).toHaveURL(/\/static$/);
  });

  test('a newer navigation supersedes an action redirect that is loading', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/rerender-action`);
    await waitForHydration(page);
    const requested = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const sent = Promise.withResolvers<void>();
    await page.route('**/RSC/R/new.txt*', async (route) => {
      const response = await route.fetch();
      requested.resolve();
      await release.promise;
      await route.fulfill({ response });
      sent.resolve();
    });
    try {
      await page
        .getByTestId('render-redirect')
        .evaluate((button: HTMLButtonElement) => button.click());
      await requested.promise;
      const cancelled = page.waitForEvent('requestfailed', {
        predicate: (request) => request.url().includes('/RSC/R/new.txt'),
      });
      await page.evaluate(
        () => window.navigation.navigate('/hello/latest').finished,
      );
      await cancelled;
      release.resolve();
      await sent.promise;
      await expect(page).toHaveURL(/\/hello\/latest$/);
      await expect(page.getByTestId('hello')).toHaveText('Hello latest');
    } finally {
      release.resolve();
    }
  });

  test('requestRefresh updates the page after a fragment-only navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/rerender-action`);
    await waitForHydration(page);
    await page.evaluate(() => window.navigation.navigate('#details').finished);
    const count = page.getByTestId('rerender-count');
    const before = Number(await count.textContent());
    await page.getByTestId('rerender').click();
    await expect(count).toHaveText(String(before + 1));
    await expect(page).toHaveURL(/\/rerender-action#details$/);
  });

  test('a late redirect follows when no newer navigation started', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-late-redirect').click();
    await expect(page.getByTestId('late-redirect')).toBeVisible();
    await expect(page.getByTestId('redirect-new')).toHaveText('New');
    await expect(page).toHaveURL(/\/new$/);
  });

  test('a late redirect does not cancel a newer navigation', async ({
    page,
  }) => {
    let newFetches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/RSC/R/new.txt') {
        newFetches += 1;
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    const release = Promise.withResolvers<void>();
    await page.route('**/RSC/R/hello/latest.txt*', async (route) => {
      const response = await route.fetch();
      await release.promise;
      await route.fulfill({ response });
    });
    try {
      const lateRedirect = waitForLateRedirect(page);
      await page.getByTestId('go-late-redirect').click();
      await expect(page.getByTestId('late-redirect')).toBeVisible();
      await page.evaluate(() => {
        void window.navigation
          .navigate('/hello/latest')
          .finished?.catch(() => {});
      });
      await expect(page).toHaveURL(/\/hello\/latest$/);
      await lateRedirect;
      await waitForFrames(page);
      release.resolve();
      await expect(page.getByTestId('hello')).toHaveText('Hello latest');
      await expect(page).toHaveURL(/\/hello\/latest$/);
      expect(newFetches).toBe(0);
    } finally {
      release.resolve();
    }
  });

  test('a late redirect does not override a fragment-only navigation', async ({
    page,
  }) => {
    let newFetches = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/RSC/R/new.txt') {
        newFetches += 1;
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    const lateRedirect = waitForLateRedirect(page);
    await page.getByTestId('go-late-redirect').click();
    await expect(page.getByTestId('late-redirect')).toBeVisible();
    await page.evaluate(() => window.navigation.navigate('#details').finished);
    await lateRedirect;
    await waitForFrames(page);
    await expect(page).toHaveURL(/\/late-redirect#details$/);
    await expect(page.getByTestId('late-redirect')).toBeVisible();
    expect(newFetches).toBe(0);
  });

  for (const { path, buttonId, contentId } of [
    { path: '/static', buttonId: 'render-static', contentId: 'static' },
    {
      path: '/rerender-action',
      buttonId: 'render-same',
      contentId: 'rerender-count',
    },
  ]) {
    test(`an action response for ${path} supersedes an older navigation that is loading`, async ({
      page,
    }) => {
      await page.goto(`http://localhost:${port}/rerender-action`);
      await waitForHydration(page);
      const requested = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const sent = Promise.withResolvers<void>();
      await page.route('**/RSC/R/hello/older.txt*', async (route) => {
        const response = await route.fetch();
        requested.resolve();
        await release.promise;
        await route.fulfill({ response });
        sent.resolve();
      });
      try {
        await page.evaluate(() => {
          void window.navigation
            .navigate('/hello/older')
            .finished?.catch(() => {});
        });
        await requested.promise;
        const cancelled = page.waitForEvent('requestfailed', {
          predicate: (request) =>
            request.url().includes('/RSC/R/hello/older.txt'),
        });
        await page
          .getByTestId(buttonId)
          .evaluate((button: HTMLButtonElement) => button.click());
        await cancelled;
        await expect(page.getByTestId(contentId)).toBeVisible();
        release.resolve();
        await sent.promise;
        await page.evaluate(() => window.navigation.transition?.finished);
        await expect(page).toHaveURL(`http://localhost:${port}${path}`);
        await expect(page.getByTestId(contentId)).toBeVisible();
      } finally {
        release.resolve();
      }
    });
  }
});
