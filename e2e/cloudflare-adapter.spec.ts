import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-adapter');

test.skip(({ browserName }) => browserName !== 'chromium');
test.skip(({ mode }) => mode !== 'PRD');

test.describe('cloudflare adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
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
  });
});
