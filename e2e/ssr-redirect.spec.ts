import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  const pageLogs: string[] = [];
  test.beforeEach(({ page }) => {
    pageLogs.length = 0;
    page.on('console', (msg) => pageLogs.push(msg.text()));
    page.on('pageerror', (err) => pageLogs.push(`pageerror: ${err}`));
  });
  test.afterEach(async ({ page }, testInfo) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      await testInfo.attach('page-console', { body: pageLogs.join('\n') });
      await testInfo.attach('page-html', {
        body: await page.content(),
        contentType: 'text/html',
      });
      await testInfo.attach('server-output', {
        body: serverOutput.join('').slice(-20000),
      });
    }
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access sync page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/sync']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/async']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action (no js)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
