import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe('router route intent reference preservation', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('preserves an opaque client object through an action and route render', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/temporary-reference`);
    await waitForHydration(page);
    await expect(page.getByText('Waiting for object')).toBeVisible();
    await page.getByRole('button', { name: 'Round trip' }).click();
    await expect(page.getByText('Original object received')).toBeVisible();
  });

  test('replays a cached static redirect on a second visit', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Intent Static Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Home Page' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Intent Static Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
  });

  test('replays a static page intent under a dynamic layout on an etag hit', async ({
    page,
  }) => {
    const etags: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/RSC/R/mixed/gate')) {
        etags.push(request.headers()['x-waku-etags'] ?? '{}');
      }
    });
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'Mixed Static Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
    await page.goBack();
    await expect(
      page.getByRole('heading', { name: 'Home Page' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Mixed Static Redirect' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/destination`);
    expect(etags.length).toBeGreaterThanOrEqual(2);
    expect(JSON.parse(etags.at(-1)!)).toHaveProperty('page:/mixed/gate', 1);
  });
});
