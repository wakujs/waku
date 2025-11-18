import { statSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import {
  FETCH_ERROR_MESSAGES,
  prepareNormalSetup,
  test,
  waitForHydration,
} from './utils.js';

const startApp = prepareNormalSetup('create-pages');

test.describe(`create-pages`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  let fixtureDir: string;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp, fixtureDir } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    const backgroundColor = await page.evaluate(() =>
      window
        .getComputedStyle(document.body)
        .getPropertyValue('background-color'),
    );
    expect(backgroundColor).toBe('rgb(254, 254, 254)');
    await expect(page.getByTestId('home-layout-render-count')).toHaveText(
      'Render Count: 1',
    );
    await page.reload();
    await expect(page.getByTestId('home-layout-render-count')).toHaveText(
      'Render Count: 1',
    );
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await page.click("a[href='/foo']");
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
  });

  test('dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/dynamic`);
    await expect(page.getByRole('navigation')).toHaveText('Dynamic Layout');
    await expect(
      page.getByRole('heading', { name: 'Dynamic Page' }),
    ).toBeVisible();
  });

  test('nested/foo', async ({ page }) => {
    // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
    await page.goto(`http://localhost:${port}/nested/foo`);
    await expect(
      page.getByRole('heading', { name: 'Deeply Nested Layout' }),
    ).toBeVisible();
  });

  test('wild/hello/world', async ({ page }) => {
    await page.goto(`http://localhost:${port}/wild/hello/world`);
    await expect(
      page.getByRole('heading', { name: 'Slug: hello/world' }),
    ).toBeVisible();
  });

  test('nested/baz', async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/baz`);
    await expect(
      page.getByRole('heading', { name: 'Nested Layout' }),
    ).toBeVisible();
  });

  test("nested/cat's pajamas", async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/cat's%20pajamas`);
    await expect(
      page.getByRole('heading', { name: "Dynamic: cat's%20pajamas" }),
    ).toBeVisible();
  });

  test('jump', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/foo']");
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    await page.click('text=Jump to random page');
    await page.waitForTimeout(500); // need to wait not to error
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Foo' }),
    ).toBeHidden();
  });

  test('jump with setState', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/foo']");
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    await page.click('text=Jump with setState');
    await expect(
      page.getByRole('heading', { name: 'Baz', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('errors', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/error']");
    await expect(
      page.getByRole('heading', { name: 'Error Page' }),
    ).toBeVisible();
    await expect(page.getByTestId('fallback-render')).toHaveText(
      'Handling RSC render error',
    );
    await page.getByTestId('server-throws').getByTestId('throws').click();
    await expect(
      page.getByRole('heading', { name: 'Error Page' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText('Something unexpected happened');
  });

  test('server function unreachable', async ({ page, mode, browserName }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/error']");
    await expect(
      page.getByRole('heading', { name: 'Error Page' }),
    ).toBeVisible();
    await page.getByTestId('server-throws').getByTestId('success').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('It worked');
    await page.getByTestId('server-throws').getByTestId('reset').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('init');
    await stopApp?.();
    await page.getByTestId('server-throws').getByTestId('success').click();
    await page.waitForTimeout(500); // need to wait?
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText(FETCH_ERROR_MESSAGES[browserName]);
    ({ port, stopApp } = await startApp(mode));
  });

  test('server page unreachable', async ({ page, mode, browserName }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await stopApp?.();
    await page.click("a[href='/error']");
    // Default router client error boundary is reached
    await expect(page.locator('p')).toContainText(
      FETCH_ERROR_MESSAGES[browserName],
    );
    ({ port, stopApp } = await startApp(mode));
  });

  // https://github.com/wakujs/waku/issues/1255
  test('long suspense', async ({ page }) => {
    await page.goto(`http://localhost:${port}/long-suspense/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('long-suspense-component')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 1' }),
    ).toBeVisible();
    await page.click("a[href='/long-suspense/2']");
    await page.waitForFunction(
      () => {
        const pendingElement = document.querySelector(
          '[data-testid="long-suspense-pending"]',
        );
        const heading = document.querySelector(
          '[data-testid="long-suspense-component"] h3',
        );
        return (
          pendingElement?.textContent === 'Pending...' &&
          heading?.textContent === 'Long Suspense Page 1'
        );
      },
      undefined,
      { timeout: 1000 },
    );
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 2' }),
    ).toBeVisible();
    await page.click("a[href='/long-suspense/3']");
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 2' }),
    ).toBeHidden();
    await expect(page.getByTestId('long-suspense')).toHaveText('Loading...');
    await expect(page.getByTestId('long-suspense-pending')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 3' }),
    ).toBeVisible();
    await page.click("a[href='/long-suspense/2']");
    await page.waitForFunction(
      () => {
        const pendingElement = document.querySelector(
          '[data-testid="long-suspense-pending"]',
        );
        const heading = document.querySelector(
          '[data-testid="long-suspense-component"] h3',
        );
        return (
          pendingElement?.textContent === 'Pending...' &&
          heading?.textContent === 'Long Suspense Page 3'
        );
      },
      undefined,
      { timeout: 1000 },
    );
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 2' }),
    ).toBeVisible();
  });

  // https://github.com/wakujs/waku/issues/1437
  test('static long suspense', async ({ page }) => {
    await page.goto(`http://localhost:${port}/static-long-suspense/4`);
    // no loading state for static
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(page.getByTestId('long-suspense-component')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 4' }),
    ).toBeVisible();
    await page.click("a[href='/static-long-suspense/5']");
    // It flashes very briefly
    // await expect(page.getByTestId('long-suspense-pending')).toHaveCount(1);
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 5' }),
    ).toBeVisible();
    await page.click("a[href='/static-long-suspense/6']");
    // It flashes very briefly
    // await expect(page.getByTestId('long-suspense-pending')).toHaveCount(0);
    // No loading state with static
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 6' }),
    ).toBeVisible();
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world!');
  });

  test('api url with search params', async () => {
    const res = await fetch(`http://localhost:${port}/api/url?foo=bar`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `url http://localhost:${port}/api/url?foo=bar`,
    );
  });

  test('api hi.txt', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello from a text file!');
  });

  test('api empty', async ({ mode }) => {
    if (mode === 'PRD') {
      expect(
        statSync(
          path.join(fixtureDir, 'dist', 'public', 'api', 'empty'),
        ).isFile(),
      ).toBe(true);
    }
    const res = await fetch(`http://localhost:${port}/api/empty`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('api hi with POST', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST to hello world! from the test!');
  });

  test('exactPath', async ({ page }) => {
    await page.goto(`http://localhost:${port}/exact/[slug]/[...wild]`);
    await expect(
      page.getByRole('heading', { name: 'EXACTLY!!' }),
    ).toBeVisible();
  });

  test('group', async ({ page }) => {
    await page.goto(`http://localhost:${port}/test`);
    await expect(
      page.getByRole('heading', { name: 'Group Page' }),
    ).toBeVisible();
  });

  test('group layout', async ({ page }) => {
    await page.goto(`http://localhost:${port}/test`);
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '/(group) Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '/test Layout' }),
    ).toBeHidden();
  });

  test('group layout static + dynamic', async ({ page }) => {
    const whatTime = async (selector: string) =>
      new Date(
        (await page
          .getByRole('heading', { name: selector })
          .textContent())!.replace(selector + ' ', ''),
      ).getSeconds();

    await page.goto(`http://localhost:${port}/nested-layouts`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: 'Dynamic Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Static Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Nested Layouts' }),
    ).toBeVisible();
    const dynamicTime = await whatTime('Dynamic Layout');
    const staticTime = await whatTime('Static Layout');
    expect(dynamicTime).toEqual(staticTime);

    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Nested Layouts' }).click();
    const dynamicTime2 = await whatTime('Dynamic Layout');
    const staticTime2 = await whatTime('Static Layout');
    expect(dynamicTime2).not.toEqual(staticTime2);
  });

  test('no ssr', async ({ page }) => {
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(
      page.getByRole('heading', { name: 'No SSR', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Only client component', exact: true }),
    ).toBeVisible();
  });

  test('slices with render=dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/slices`);
    await waitForHydration(page);
    // basic test
    const staticSliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(staticSliceText.startsWith('Slice 001')).toBeTruthy();
    const dynamicSliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(dynamicSliceText.startsWith('Slice 002')).toBeTruthy();

    await page.getByRole('link', { name: 'Home' }).click();
    await page.waitForTimeout(1000);
    await page.getByRole('link', { name: 'Slices' }).click();

    // test dynamic and static slices behavior after soft navigation
    const staticSliceText2 = page.getByTestId('slice001');
    await expect(staticSliceText2).toHaveText(staticSliceText);
    const dynamicSliceText2 = page.getByTestId('slice002');
    await expect(dynamicSliceText2).not.toHaveText(dynamicSliceText);

    // test static slices behavior after hard navigation
    await page.reload();
    const staticSliceText3 = page.getByTestId('slice001');
    await expect(staticSliceText3).toHaveText(staticSliceText);
  });

  test('slices with lazy', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/slices`);
    await expect(page.getByTestId('slice003-loading')).toBeVisible();
    await expect(page.getByTestId('slice003')).toHaveText('Slice 003');
  });
});

test.describe(`create-pages STATIC`, () => {
  test.skip(
    ({ mode }) => mode !== 'PRD',
    'static tests are only relevant in production mode',
  );

  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('STATIC'));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('no ssr', async ({ page }) => {
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(
      page.getByRole('heading', { name: 'No SSR', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Only client component', exact: true }),
    ).toBeVisible();
  });

  test('no ssr in no js environment', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(page.getByText('Not Found')).toBeHidden();
    await page.close();
    await context.close();
  });

  test('slices with render=static', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/static-slices`);
    await waitForHydration(page);
    await expect(page.getByTestId('slice001-loading')).toBeVisible();
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
  });
});
