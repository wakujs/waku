import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('create-pages');

test.describe(`build table`, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Browsers are not relevant for this test. One is enough.',
  );
  test.skip(
    ({ mode }) => mode !== 'PRD',
    'Partial builds are only relevant in production mode.',
  );
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, 'npm'));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('build repo', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
  });
});
