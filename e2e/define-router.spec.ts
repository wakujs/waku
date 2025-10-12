import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('define-router');

test.describe(`define-router`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.click("a[href='/foo']");
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('bar1 (dynamic page + static slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    const sliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 001')).toBeTruthy();
    await page.click("a[href='/bar1']");
    await expect(page.getByTestId('bar1-title')).toHaveText('Bar1');
    const sliceText2 = page.getByTestId('slice001');
    await expect(sliceText2).toHaveText(sliceText);
    const randomText = (await page
      .getByTestId('bar1-random')
      .textContent()) as string;
    await page.reload();
    await expect(page.getByTestId('bar1-title')).toHaveText('Bar1');
    if (mode === 'PRD') {
      await expect(page.getByTestId('bar1-random')).not.toHaveText(randomText);
    }
  });

  test('bar2 (static page + dynamic slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/bar2`);
    await waitForHydration(page);
    await expect(page.getByTestId('bar2-title')).toHaveText('Bar2');
    const randomText = (await page
      .getByTestId('bar2-random')
      .textContent()) as string;
    const sliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 002')).toBeTruthy();
    await page.click("a[href='/']");
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.click("a[href='/bar2']");
    await expect(page.getByTestId('bar2-title')).toHaveText('Bar2');
    const sliceText2 = page.getByTestId('slice002');
    await expect(sliceText2).not.toHaveText(sliceText);
    if (mode === 'PRD') {
      await expect(page.getByTestId('bar2-random')).toHaveText(randomText);
    }
  });

  test('baz1 (dynamic page + lazy static slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    const sliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 001')).toBeTruthy();
    await page.click("a[href='/baz1']");
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    const randomText = (await page
      .getByTestId('baz1-random')
      .textContent()) as string;
    const sliceText2 = page.getByTestId('slice001');
    await expect(sliceText2).toHaveText(sliceText);
    await page.reload();
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    if (mode === 'PRD') {
      await expect(page.getByTestId('baz1-random')).not.toHaveText(randomText);
    }
  });

  test('baz2 (static page + lazy dynamic slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/baz2`);
    await waitForHydration(page);
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    const randomText = (await page
      .getByTestId('baz2-random')
      .textContent()) as string;
    const sliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 002')).toBeTruthy();
    await page.click("a[href='/']");
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.click("a[href='/baz2']");
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    await page.waitForTimeout(100); // need to wait to refetch the slice
    const sliceText2 = page.getByTestId('slice002');
    await expect(sliceText2).not.toHaveText(sliceText);
    if (mode === 'PRD') {
      await expect(page.getByTestId('baz2-random')).toHaveText(randomText);
    }
  });

  test('direct baz1 (static page + lazy dynamic slice)', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/baz1`);
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    await expect(page.getByTestId('slice001-loading')).toBeVisible();
    await expect(page.getByTestId('slice001')).toBeVisible();
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
  });

  test('direct baz2 (static page + lazy dynamic slice)', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/baz2`);
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    await expect(page.getByTestId('slice002-loading')).toBeVisible();
    await expect(page.getByTestId('slice002')).toBeVisible();
    const sliceText = await page.getByTestId('slice002').textContent();
    expect(sliceText?.startsWith('Slice 002')).toBeTruthy();
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world!');
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
});
