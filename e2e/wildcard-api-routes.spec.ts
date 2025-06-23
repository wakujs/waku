import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('wildcard-api-routes');

test.describe(`wildcard api routes`, async () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test(`works`, async ({ page }) => {
    // index route matches wildcard:
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: '/foo' })).toBeVisible();

    // api route request
    const response = await page.request.get(
      `http://localhost:${port}/api/greet`,
    );
    const text = await response.text();
    expect(text).toBe('Hello, world!');
  });
});
