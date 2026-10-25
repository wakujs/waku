import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('mixed-routing');

const routes = [
  { path: '/', heading: 'File-based home', source: 'file', names: [] },
  { path: '/about', heading: 'File-based about', source: 'file', names: [] },
  {
    path: '/configured',
    heading: 'Configured static page',
    source: 'config',
    names: [],
  },
  {
    path: '/hello/Waku',
    heading: 'Configured dynamic page',
    source: 'config',
    names: ['Waku'],
  },
  {
    path: '/hello/Ada',
    heading: 'Configured dynamic page',
    source: 'config',
    names: ['Ada'],
  },
];

test.describe('mixed routing', () => {
  let port: number;
  let fixtureDir: string;
  let stopApp: (() => Promise<void>) | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, fixtureDir, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp?.();
  });

  for (const { path, heading, source, names } of routes) {
    test(`renders ${path} with the shared file layout`, async ({ page }) => {
      const response = await page.goto(`http://localhost:${port}${path}`);
      expect(response?.status()).toBe(200);
      expect(await response!.text()).toContain(heading);
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
      await expect(
        page.locator(`[data-route-source="${source}"]`),
      ).toBeVisible();
      await expect(page.getByRole('banner')).toHaveText(/Waku mixed routing/);
      await expect(
        page.getByRole('navigation', { name: 'Main' }),
      ).toBeVisible();
      await expect(page.getByTestId('name')).toHaveText(names);
    });
  }

  test('navigates between file-based and configured pages', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByRole('link', { name: 'About', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'File-based about' }),
    ).toBeVisible();

    // Configured URLs use ordinary anchors because typegen omits virtual modules.
    await page
      .getByRole('link', { name: 'Configured static', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Configured static page' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Configured dynamic', exact: true })
      .click();
    await expect(page.getByTestId('name')).toHaveText('Waku');

    await waitForHydration(page);
    await page.getByRole('link', { name: 'Home', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'File-based home' }),
    ).toBeVisible();
  });

  for (const name of ['Waku', 'Ada']) {
    test(`keeps middleware for /hello/${name}/ and preserves the query`, async ({
      request,
    }) => {
      const response = await request.get(
        `http://localhost:${port}/hello/${name}/?from=test`,
        {
          maxRedirects: 0,
        },
      );
      expect(response.status()).toBe(301);
      const location = new URL(response.headers().location!, response.url());
      expect(location.pathname).toBe(`/hello/${name}`);
      expect(location.search).toBe('?from=test');
    });
  }

  test('redirects static page trailing slashes in development @dev', async ({
    request,
  }) => {
    const response = await request.get(
      `http://localhost:${port}/configured/?from=test`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(301);
    const location = new URL(response.headers().location!, response.url());
    expect(location.pathname).toBe('/configured');
    expect(location.search).toBe('?from=test');
  });

  test('serves built static HTML before application middleware @prd', async ({
    request,
  }) => {
    const response = await request.get(
      `http://localhost:${port}/configured/?from=test`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(200);
    expect(await response.text()).toContain('Configured static page');
  });

  test('returns 404 for an unregistered route', async ({ request }) => {
    const response = await request.get(
      `http://localhost:${port}/not-registered`,
    );
    expect(response.status()).toBe(404);
  });

  test('emits HTML for static routes but not dynamic routes @prd', async () => {
    const publicDir = join(fixtureDir, 'dist/public');
    for (const file of [
      'index.html',
      'about/index.html',
      'configured/index.html',
    ]) {
      expect(existsSync(join(publicDir, file))).toBe(true);
    }
    expect(existsSync(join(publicDir, 'hello'))).toBe(false);
  });
});
