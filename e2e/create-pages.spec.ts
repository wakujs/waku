import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup, FETCH_ERROR_MESSAGES } from './utils.js';

const startApp = prepareStandaloneSetup('create-pages');

test.describe(`create-pages`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
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
    await expect(page.getByRole('navigation')).toHaveText(
      'Current path: /dynamic',
    );
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
    await page.click("a[href='/foo']");
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    await page.click('text=Jump to random page');
    await page.waitForTimeout(500); // need to wait not to error
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(
      page.getByRole('heading', { level: 2, name: 'Foo' }),
    ).not.toBeVisible();
  });

  test('jump with setState', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}`);
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
    await stopApp?.();
    await page.click("a[href='/error']");
    // Default router client error boundary is reached
    await expect(
      page.getByRole('heading', { name: FETCH_ERROR_MESSAGES[browserName] }),
    ).toBeVisible();
    ({ port, stopApp } = await startApp(mode));
  });

  // https://github.com/wakujs/waku/issues/1255
  test('long suspense', async ({ page }) => {
    await page.goto(`http://localhost:${port}/long-suspense/1`);
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
    ).not.toBeVisible();
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

  test('api empty', async () => {
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
    ).not.toBeVisible();
  });

  test('all page parts show', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-parts`);
    await expect(
      page.getByRole('heading', { name: 'Static Page Part' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Dynamic Page Part' }),
    ).toBeVisible();
  });

  test('static page part', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-parts`);
    const staticPageTime = (
      await page
        .getByRole('heading', { name: 'Static Page Part' })
        .textContent()
    )?.split('Part ')[1];
    expect(staticPageTime).toBeTruthy();
    await page.click("a[href='/']");
    await page.waitForTimeout(100);
    await page.click("a[href='/page-parts']");
    await expect(
      page.getByRole('heading', { name: 'Static Page Part' }),
    ).toBeVisible();
    const newStaticPageTime = (
      await page
        .getByRole('heading', { name: 'Static Page Part' })
        .textContent()
    )?.split('Part ')[1];
    expect(newStaticPageTime).toBe(staticPageTime);
    const dynamicPageTime = (
      await page
        .getByRole('heading', { name: 'Dynamic Page Part' })
        .textContent()
    )?.split('Part ')[1];
    expect(dynamicPageTime).toBeTruthy();
    expect(dynamicPageTime).not.toBe(staticPageTime);
  });

  test('group layout static + dynamic', async ({ page }) => {
    const whatTime = async (selector: string) =>
      new Date(
        (await page
          .getByRole('heading', { name: selector })
          .textContent())!.replace(selector + ' ', ''),
      ).getSeconds();

    await page.goto(`http://localhost:${port}/nested-layouts`);
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
});
