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

  // @TODO: re-enable when root wildcard route can match index route
  test.skip('catch all route can match as index route', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('Catch All Pages Route')).toBeVisible();
  });

  test(`api route matches before wildcard route`, async ({ page }) => {
    // misc route matches wildcard:
    await page.goto(`http://localhost:${port}/foo/bar`);
    await expect(page.getByRole('heading', { name: '/foo/bar' })).toBeVisible();

    // api route request
    const response = await page.request.get(
      `http://localhost:${port}/api/greet`,
    );
    const text = await response.text();
    expect(text).toBe('Greetings from the API!');
  });

  test('api standard route matches before wildcard route', async ({ page }) => {
    const response = await page.request.get(
      `http://localhost:${port}/api/greet`,
    );
    const text = await response.text();
    expect(text).toBe('Greetings from the API!');
  });

  test(`static nested catch-all route matches before root catch-all route`, async ({
    page,
  }) => {
    const response = await page.request.get(
      `http://localhost:${port}/api/v1/foo/bar`,
    );
    const text = await response.text();
    expect(text).toBe('API Wildcard!');

    const response2 = await page.request.get(
      `http://localhost:${port}/api/foo/bar`,
    );
    const text2 = await response2.text();
    expect(text2).toBe('/api root catch-all');
  });
});
