import { type Page, expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('base-path');

test.describe(`base-path`, () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('api', async ({ request }) => {
    const baseUrl = `http://localhost:${port}/custom/base/`;

    // get
    const resGet = await request.get(`${baseUrl}api/hello`);
    expect(resGet.ok()).toBe(true);
    expect(await resGet.json()).toEqual({
      ok: true,
      request: {
        handler: 'GET',
        method: 'GET',
        pathname: '/api/hello',
      },
    });

    // post
    const resPost = await request.post(`${baseUrl}api/hello`, {
      data: 'hello',
    });
    expect(resPost.ok()).toBe(true);
    expect(await resPost.json()).toEqual({
      ok: true,
      request: {
        handler: 'POST',
        method: 'POST',
        pathname: '/api/hello',
        text: 'hello',
      },
    });
  });

  test('basic', async ({ page, mode }) => {
    await basicTest(page, `http://localhost:${port}/custom/base/`);

    // test static
    if (mode === 'PRD') {
      await stopApp?.();
      ({ port, stopApp } = await startApp(mode, {
        cmd: 'pnpm start-static',
      }));
      await basicTest(page, `http://localhost:${port}/custom/base/`);
    }
  });
});

async function basicTest(page: Page, baseUrl: string) {
  await page.goto(baseUrl);
  await waitForHydration(page);

  // client component
  await expect(page.getByTestId('client-counter')).toHaveText('Count: 0');
  await page.getByTestId('client-counter').click();
  await expect(page.getByTestId('client-counter')).toHaveText('Count: 1');

  // style
  await expect(page.locator('.test-style')).toHaveCSS(
    'color',
    'rgb(255, 150, 0)',
  );

  // client side navigation
  await page.getByRole('link', { name: 'Static' }).click();
  await page.waitForURL(`${baseUrl}static`);
  await expect(
    page.getByRole('heading', { name: 'Static page' }),
  ).toBeVisible();

  // ssr
  await page.goto(`${baseUrl}static`);
  await expect(
    page.getByRole('heading', { name: 'Static page' }),
  ).toBeVisible();
}
