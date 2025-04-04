import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('fs-router');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`fs-router: ${mode}`, async () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('home', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      const backgroundColor = await page.evaluate(() =>
        window
          .getComputedStyle(document.body)
          .getPropertyValue('background-color'),
      );
      expect(backgroundColor).toBe('rgba(0, 0, 0, 0)');
    });

    test('foo', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/foo']");
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    });

    test('nested/foo', async ({ page }) => {
      // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
      await page.goto(`http://localhost:${port}/nested/foo`);
      await expect(
        page.getByRole('heading', { name: 'Nested / foo' }),
      ).toBeVisible();
    });

    test('nested/baz', async ({ page }) => {
      await page.goto(`http://localhost:${port}/nested/baz`);
      await expect(
        page.getByRole('heading', { name: 'Nested Layout' }),
      ).toBeVisible();
    });

    test('api hi', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('Hello from API!');
    });

    test('api hi.txt', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi.txt`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello from a text file!');
    });

    test('api empty', async () => {
      const res = await fetch(`http://localhost:${port}/api/empty`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });

    test('api hi with POST', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi`, {
        method: 'POST',
        body: 'from the test!',
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('POST Hello from API! from the test!');
    });

    test('api has-default GET', async () => {
      const res = await fetch(`http://localhost:${port}/api/has-default`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('GET');
    });

    test('api has-default POST', async () => {
      const res = await fetch(`http://localhost:${port}/api/has-default`, {
        method: 'POST',
        body: 'from the test!',
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('default: POST');
    });

    test('_components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/_components/Counter`);
      await expect(page.getByText('404 Not Found')).toBeVisible();
    });

    test('all page parts show', async ({ page }) => {
      await page.goto(`http://localhost:${port}/page-parts`);
      await expect(
        page.getByRole('heading', { name: 'Static Page Part' }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Dynamic Page Part' }),
      ).toBeVisible();
    });

    test('static page part', async ({ page }) => {
      await page.goto(`http://localhost:${port}/page-parts`);
      const staticPageTime = (
        await page
          .getByRole('heading', { name: 'Static Page Part' })
          .textContent()
      )?.split('Part ')[1];
      expect(staticPageTime).toBeTruthy();
      await page.click("a[href='/']");
      await page.waitForTimeout(100);
      await page.click("a[href='/page-parts']");
      await expect(
        page.getByRole('heading', { name: 'Static Page Part' }),
      ).toBeVisible();
      const newStaticPageTime = (
        await page
          .getByRole('heading', { name: 'Static Page Part' })
          .textContent()
      )?.split('Part ')[1];
      expect(newStaticPageTime).toBe(staticPageTime);
      const dynamicPageTime = (
        await page
          .getByRole('heading', { name: 'Dynamic Page Part' })
          .textContent()
      )?.split('Part ')[1];
      expect(dynamicPageTime).toBeTruthy();
      expect(dynamicPageTime).not.toBe(staticPageTime);
    });

    test('alt click', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await page.click("a[href='/foo']", {
        button: 'right',
      });
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await page.click("a[href='/foo']", {
        modifiers: ['ControlOrMeta'],
      });
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    });
  });
}
