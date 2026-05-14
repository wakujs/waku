import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-without-vite-plugin');

test.skip(({ browserName }) => browserName !== 'chromium');
test.skip(({ mode }) => mode !== 'PRD');

test.describe('cloudflare adapter without @cloudflare/vite-plugin', () => {
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

  // On Windows the cloudflare adapter's build path streams files through
  // `Readable.fromWeb(...).pipe(res)`, which hits a libuv async-handle race
  // (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, src\win\async.c)
  // that aborts the Node process. The crash surfaces here as a beforeAll
  // failure: `prepareNormalSetup` runs `waku build` before starting wrangler.
  test('build completes without crashing the Node process', () => {
    expect(port).toBeGreaterThan(0);
  });
});
