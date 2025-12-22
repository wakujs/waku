import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('rsc-css-modules');

test.describe(`rsc-css-modules`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('css-modules classes', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);

    const wrapperClass = await page
      .getByTestId('app-wrapper')
      .getAttribute('class');
    expect(wrapperClass).toContain('wrapper');

    const appNameClass = await page
      .getByTestId('app-name')
      .getAttribute('class');
    expect(appNameClass).toContain('text');

    const clientcounterClass = await page
      .getByTestId('client-counter')
      .getAttribute('class');
    expect(clientcounterClass).toContain('counterWrapper');

    const incrementClass = await page
      .getByTestId('increment')
      .getAttribute('class');
    expect(incrementClass).toContain('counterButton');
  });
});
