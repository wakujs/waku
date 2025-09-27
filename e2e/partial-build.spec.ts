import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findWakuPort, terminate, test } from './utils.js';
import { expect } from '@playwright/test';
import { rmSync, statSync } from 'fs';

const cwd = fileURLToPath(new URL('./fixtures/partial-build', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'Browsers are not relevant for this test. One is enough.',
);
test.skip(
  ({ mode }) => mode !== 'PRD',
  'Partial builds are only relevant in production mode.',
);

test.describe(`partial builds`, () => {
  let cp: ChildProcess | undefined;
  let port: number;
  test.beforeEach(async ({ page }) => {
    rmSync(`${cwd}/dist`, { recursive: true, force: true });
    execSync(`node ${waku} build`, {
      cwd,
      env: { ...process.env, PAGES: 'a' },
    });
    cp = exec(`node ${waku} start`, { cwd });
    port = await findWakuPort(cp);
    await page.goto(`http://localhost:${port}/page/a`);
    expect(await page.getByTestId('title').textContent()).toBe('a');
  });
  test.afterEach(async () => {
    await terminate(port);
  });

  test('does not change pages that already exist', async () => {
    const htmlBefore = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscBefore = statSync(`${cwd}/dist/public/RSC/R/page/a.txt`);
    execSync(`node ${waku} build --experimental-partial`, {
      cwd,
      env: { ...process.env, PAGES: 'a,b' },
    });
    const htmlAfter = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscAfter = statSync(`${cwd}/dist/public/RSC/R/page/a.txt`);
    expect(htmlBefore.mtimeMs).toBe(htmlAfter.mtimeMs);
    expect(rscBefore.mtimeMs).toBe(rscAfter.mtimeMs);
  });

  test('adds new pages', async ({ page }) => {
    execSync(`node ${waku} build --experimental-partial`, {
      cwd,
      env: { ...process.env, PAGES: 'a,b' },
    });
    await page.goto(`http://localhost:${port}/page/b`);
    expect(await page.getByTestId('title').textContent()).toBe('b');
  });

  test('does not delete old pages', async ({ page }) => {
    execSync(`node ${waku} build --experimental-partial`, {
      cwd,
      env: { ...process.env, PAGES: 'c' },
    });
    await page.goto(`http://localhost:${port}/page/a`);
    expect(await page.getByTestId('title').textContent()).toBe('a');
    await page.goto(`http://localhost:${port}/page/c`);
    expect(await page.getByTestId('title').textContent()).toBe('c');
  });
});
