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

  test('build completes without crashing the Node process', () => {
    expect(port).toBeGreaterThan(0);
  });
});
