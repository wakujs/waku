import type { ChildProcess } from 'node:child_process';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let cp: ChildProcess;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp, cp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly (DEV)', async ({ page, mode }) => {
    test.skip(mode !== 'DEV', 'DEV only test');
    // TODO: async redirection on dev is flaky, so wrap with retry for now
    // https://github.com/wakujs/waku/pull/1586
    await expect(async () => {
      await page.goto(`http://localhost:${port}/async`);
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    }).toPass();
  });

  test('access async page directly (PRD)', async ({ page, mode }) => {
    test.skip(mode !== 'PRD', 'PRD only test');
    await page.goto(`http://localhost:${port}/async`);
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
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    const serverOutput: string[] = [];
    const onData = (data: any) => serverOutput.push(data.toString());
    cp.stdout?.on('data', onData);
    cp.stderr?.on('data', onData);

    await expect(async () => {
      await page.goto(`http://localhost:${port}/async`);
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    }).toPass();

    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
