import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('wildcard-api-routes');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`wildcard api routes: ${mode}`, async () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test(`works`, async ({ page }) => {
      // index route matches wildcard:
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: '/' })).toBeVisible();

      // api route request
      let response = await page.request.get(`http://localhost:${port}/api/greet`);
      let text = await response.text();
      expect(text).toBe('Hello, world!');
    });
  });
}
