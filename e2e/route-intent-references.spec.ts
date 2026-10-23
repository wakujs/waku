import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe('router route intent reference preservation', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, { host: '127.0.0.1' }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('preserves an opaque client object through an action and route render', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/temporary-reference`);
    await waitForHydration(page);
    await expect(page.getByText('Waiting for object')).toBeVisible();
    await page.getByRole('button', { name: 'Round trip' }).click();
    await expect(page.getByText('Original object received')).toBeVisible();
  });

  test('replays a cached static redirect on a second visit', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Intent Static Redirect' }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/destination`);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Home Page' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Intent Static Redirect' }).click();
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/destination`);
  });
});
