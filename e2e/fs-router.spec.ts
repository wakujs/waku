import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('fs-router');

test.describe('fs-router', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    const backgroundColor = await page.evaluate(() =>
      window
        .getComputedStyle(document.body)
        .getPropertyValue('background-color'),
    );
    expect(backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/foo']");
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
  });

  test('nested/foo', async ({ page }) => {
    // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
    await page.goto(`http://localhost:${port}/nested/foo`);
    await expect(
      page.getByRole('heading', { name: 'Nested / foo' }),
    ).toBeVisible();
  });

  test('nested/baz', async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/baz`);
    await expect(
      page.getByRole('heading', { name: 'Nested Layout' }),
    ).toBeVisible();
  });

  test('check hydration error', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('check hydration error with useId', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    await waitForHydration(page);
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello from API!');
  });

  test('api hi.txt', async () => {
    const res = await fetch(`http://localhost:${port}/hi.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello from a text file!');
  });

  test('api empty', async () => {
    const res = await fetch(`http://localhost:${port}/empty`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('api hi with POST', async () => {
    const res = await fetch(`http://localhost:${port}/hi`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST Hello from API! from the test!');
  });

  test('api has-default GET', async () => {
    const res = await fetch(`http://localhost:${port}/has-default`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('GET');
  });

  test('api has-default POST', async () => {
    const res = await fetch(`http://localhost:${port}/has-default`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('default: POST');
  });

  test('api blog/rss.xml', async () => {
    const res = await fetch(`http://localhost:${port}/blog/rss.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
    const text = await res.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('<rss version="2.0">');
  });

  test('_components', async ({ page }) => {
    await page.goto(`http://localhost:${port}/_components/Counter`);
    await expect(page.getByText('404 Not Found')).toBeVisible();
  });

  test('alt click', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.click("a[href='/foo']", {
      button: 'right',
    });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.click("a[href='/foo']", {
      modifiers: ['Alt'],
    });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test('encoded path', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.click("a[href='/nested/encoded%20path']");
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
  });

  test('check hydration error with unicode page', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/%ED%95%9C%EA%B8%80`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: '/%ED%95%9C%EA%B8%80' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '/한글' })).toBeHidden();
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('slices', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-with-slices`);
    await waitForHydration(page);
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
    await expect(page.getByTestId('slice002')).toHaveText('Slice 002');
  });

  test('segment route in group route', async ({ page }) => {
    await page.goto(
      `http://localhost:${port}/page-with-segment/introducing-waku`,
    );
    const heading = page.getByRole('heading', { name: 'introducing-waku' });
    await expect(heading).toBeVisible();
  });

  test('segment route', async ({ page }) => {
    await page.goto(
      `http://localhost:${port}/page-with-segment/article/introducing-waku`,
    );
    const heading = page.getByRole('heading', { name: 'introducing-waku' });
    await expect(heading).toBeVisible();
  });

  test('css split', async ({ page }) => {
    // each ssr-ed page includes split css
    await page.goto(`http://localhost:${port}/css-split/page1`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.goto(`http://localhost:${port}/css-split/page1/nested`);
    await waitForHydration(page);
    await expect(
      page.getByText('css-split / page1 / nested / index'),
    ).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.goto(`http://localhost:${port}/css-split/page2`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page2 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
    await page.goto(`http://localhost:${port}/css-split/page2/nested`);
    await waitForHydration(page);
    await expect(
      page.getByText('css-split / page2 / nested / index'),
    ).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );

    // client navigation cannot remove existing styles
    // page1 -> red
    // page2 -> blue
    // page1 -> blue (last stylesheet wins)
    await page.goto(`http://localhost:${port}/css-split/page1`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.click("a[href='/css-split/page2']");
    await expect(page.getByText('css-split / page2 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
    await page.click("a[href='/css-split/page1']");
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
  });

  test('subroute', async ({ page }) => {
    await page.goto(`http://localhost:${port}/subroute`);
    await expect(page.getByRole('heading', { name: 'Subroute' })).toBeVisible();
  });

  test('subroute catch-all', async ({ page }) => {
    await page.goto(`http://localhost:${port}/subroute/test`);
    await expect(
      page.getByRole('heading', { name: 'Subroute Catch-All: test' }),
    ).toBeVisible();

    await page.goto(`http://localhost:${port}/subroute/test/deep/path`);
    await expect(
      page.getByRole('heading', {
        name: 'Subroute Catch-All: test/deep/path',
      }),
    ).toBeVisible();
  });
});
