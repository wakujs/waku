import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-nonce');

const TEST_NONCE = 'test-nonce-12345';

test.describe(`ssr-nonce`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('should have nonce in CSP header and raw HTML', async ({ request }) => {
    const response = await request.get(`http://localhost:${port}/`);
    const html = await response.text();

    // Check CSP header
    const cspHeader = response.headers()['content-security-policy'];
    expect(cspHeader).toContain(`'nonce-${TEST_NONCE}'`);

    // Check raw HTML has script tags with nonce attribute
    // (browser DOM hides nonce for security, so we check raw HTML)
    expect(html).toContain(`nonce="${TEST_NONCE}"`);
  });

  test('page renders correctly without CSP violations', async ({ page }) => {
    const cspViolations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy')) {
        cspViolations.push(msg.text());
      }
    });

    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Nonce Test');
    await expect(page.getByTestId('message')).toHaveText(
      'Hello from SSR with nonce!',
    );

    // No CSP violations should occur
    expect(cspViolations).toHaveLength(0);
  });
});
