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
    await page.click("a[href='/sync']");
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.click("a[href='/async']");
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.click('text=Redirect Action');
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action (no js)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.click('text=Redirect Action');
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
    request,
  }) => {
    // Diagnostic: check if the dev server is responsive before navigating
    const healthCheck = await request
      .get(`http://localhost:${port}/`)
      .catch((e: unknown) => e);
    console.log(
      `[ssr-redirect-diag] server health: ${healthCheck instanceof Error ? healthCheck.message : `status ${(healthCheck as { status: () => number }).status()}`}`,
    );

    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);

    // Diagnostic: check what the page shows after hydration
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log(
      `[ssr-redirect-diag] body after hydration: ${JSON.stringify(bodyText.slice(0, 200))}`,
    );

    // Diagnostic: check if server still responds while waiting for redirect
    const midCheck = await request
      .get(`http://localhost:${port}/destination`)
      .catch((e: unknown) => e);
    console.log(
      `[ssr-redirect-diag] server mid-test: ${midCheck instanceof Error ? midCheck.message : `status ${(midCheck as { status: () => number }).status()}`}`,
    );

    await expect(page.getByRole('heading')).toHaveText('Destination Page', {
      timeout: 30_000,
    });
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
