import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { getFreePort, terminate, test } from './utils.js';
import { rm } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { statSync } from 'fs';

const cwd = fileURLToPath(new URL('./fixtures/partial-build', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

test.describe(`partial builds`, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Browsers are not relevant for this test. One is enough.',
  );

  let cp: ChildProcess;
  let port: number;

  test.beforeEach(async ({ page }) => {
    await rm(`${cwd}/dist`, {
      recursive: true,
      force: true,
    });
    execSync(`pnpm build`, { cwd });
    port = await getFreePort();
    // Use a static http server to make sure its not accidentally SSR.
    cp = exec(`node ${waku} start --port ${port}`, { cwd });
    await waitPort({ port });
    await page.goto(`http://localhost:${port}/page/a`);
    expect(await page.getByTestId('title').textContent()).toBe('a');
  });

  test('does not change pages that already exist', async () => {
    const htmlBefore = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscBefore = statSync(`${cwd}/dist/public/RSC/page/a.txt`);
    execSync(`node ${waku} build --partial`, { cwd, env: { PAGE: 'a,b' } });
    const htmlAfter = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscAfter = statSync(`${cwd}/dist/public/RSC/page/a.txt`);
    expect(htmlBefore.mtimeMs).toBe(htmlAfter.mtimeMs);
    expect(rscBefore.mtimeMs).toBe(rscAfter.mtimeMs);
  });

  test('adds new pages', async ({ page }) => {
    execSync(`node ${waku} build --partial`, { cwd, env: { PAGE: 'a,b' } });
    await page.goto(`http://localhost:${port}/page/b`);
    expect(await page.getByTestId('title').textContent()).toBe('b');
  });

  test('does not delete old pages', async ({ page }) => {
    execSync(`node ${waku} build --partial`, { cwd, env: { PAGE: 'c' } });
    await page.goto(`http://localhost:${port}/page/a`);
    expect(await page.getByTestId('title').textContent()).toBe('a');
    await page.goto(`http://localhost:${port}/page/c`);
    expect(await page.getByTestId('title').textContent()).toBe('c');
  });

  test.afterEach(async () => {
    await terminate(cp.pid!);
  });
});
