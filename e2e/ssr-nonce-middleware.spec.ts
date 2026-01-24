import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('ssr-nonce-middleware');

const TEST_NONCE = 'test-nonce-middleware-12345';

test.describe(`ssr-nonce-middleware`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('should have nonce attribute on script tags', async ({ page }) => {
    const response = await page.goto(`http://localhost:${port}/`);

    // Check CSP header
    const cspHeader = response?.headers()['content-security-policy'];
    expect(cspHeader).toContain(`'nonce-${TEST_NONCE}'`);

    // Check that script tags have the nonce attribute
    const scripts = await page.locator('script[nonce]').all();
    expect(scripts.length).toBeGreaterThan(0);

    for (const script of scripts) {
      const nonce = await script.getAttribute('nonce');
      expect(nonce).toBe(TEST_NONCE);
    }
  });

  test('page renders correctly with nonce', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('title')).toHaveText('Nonce Middleware Test');
    await expect(page.getByTestId('message')).toHaveText(
      'Hello from SSR with nonce via middleware!',
    );
  });
});
