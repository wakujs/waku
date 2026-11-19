import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-adapter');

test.describe('cloudflare adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let buildResult: { stdout: string; stderr: string } | undefined;

  test.beforeAll(async () => {
    ({ port, stopApp, buildResult } = await startApp('PRD', {
      cmd: 'npx wrangler dev',
      portFlag: '--port',
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  // https://github.com/wakujs/waku/issues/2083
  test('renders _root and _layout on dynamic pages', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('root-marker')).toHaveText('ROOT_MARKER');
    await expect(page.getByTestId('layout-marker')).toHaveText('LAYOUT_MARKER');
    await expect(page.getByTestId('page-marker')).toHaveText('PAGE_MARKER');
    await expect(page.getByTestId('cloudflare-env')).toHaveText('MAX_ITEMS=10');
    await expect(page.getByTestId('waku-env')).toHaveText('GREETING=hello');
  });

  test('prerenders getEnv values into static pages', async ({ page }) => {
    await page.goto(`http://localhost:${port}/static-env`);
    await expect(page.getByTestId('static-env')).toHaveText('GREETING=hello');
  });

  test('does not serve the static build endpoint after the build', async ({
    request,
  }) => {
    const url = `http://localhost:${port}/__waku_internal_build_static_files`;
    expect((await request.get(url)).status()).toBe(404);
    const withToken = await request.get(url, {
      headers: { 'x-waku-internal-build-token': 'undefined' },
    });
    expect(withToken.status()).toBe(404);
  });

  test('build does not warn about Node.js imports in the ssr (worker) environment', () => {
    const output =
      (buildResult?.stdout ?? '') + '\n' + (buildResult?.stderr ?? '');
    expect(output).not.toMatch(
      /Unexpected Node\.js imports for environment "ssr"/,
    );
  });
});
