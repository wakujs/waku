import { expect } from '@playwright/test';

import { test, prepareNormalSetup, waitForHydration } from './utils.js';
import { rmSync } from 'node:fs';

const startApp = prepareNormalSetup('cloudflare-plugin');

// clear persisted state
test.beforeAll(() => {
  try {
    rmSync('./e2e/fixtures/cloudflare-plugin/.wrangler', {
      recursive: true,
      force: true,
    });
  } catch (e) {
    // skip windows ci error
    // Error: EPERM, Permission denied: \\?\D:\a\waku\waku\e2e\fixtures\cloudflare-plugin\.wrangler '\\?\D:\a\waku\waku\e2e\fixtures\cloudflare-plugin\.wrangler'
    if (process.platform === 'win32') {
      console.error(e);
      return;
    }
    throw e;
  }
});

test.describe(`cloudflare-plugin`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, { packageScript: true }));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    // client counter
    await expect(page.getByTestId('client-counter')).toHaveText(
      'Client counter: 0',
    );
    await page.getByTestId('client-counter').click();
    await expect(page.getByTestId('client-counter')).toHaveText(
      'Client counter: 1',
    );

    // kv server counter
    await expect(page.getByTestId('server-counter')).toHaveText(
      'Server counter: 0',
    );
    await page.getByTestId('server-counter').click();
    await expect(page.getByTestId('server-counter')).toHaveText(
      'Server counter: 1',
    );

    // vars
    await page.getByRole('link', { name: 'static' }).click();
    await expect(page.getByTestId('vars')).toHaveText('MY_VAR = my-value');
  });
});

test.describe(`cloudflare-plugin ssg`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    test.skip(mode !== 'PRD');
    ({ port, stopApp } = await startApp('STATIC'));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/static`);
    await waitForHydration(page);

    // client counter
    await expect(page.getByTestId('client-counter')).toHaveText(
      'Client counter: 0',
    );
    await page.getByTestId('client-counter').click();
    await expect(page.getByTestId('client-counter')).toHaveText(
      'Client counter: 1',
    );

    // vars
    await page.getByRole('link', { name: 'static' }).click();
    await expect(page.getByTestId('vars')).toHaveText('MY_VAR = my-value');
  });
});
