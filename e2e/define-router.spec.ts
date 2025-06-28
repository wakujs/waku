import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('define-router');

test.describe(`define-router`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.getByText('Foo').click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('bar (slice)', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
    await page.getByText('Bar').click();
    await expect(page.getByTestId('bar-title')).toHaveText('Bar');
    await expect(page.getByTestId('slice001')).toHaveText(sliceText!);
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
