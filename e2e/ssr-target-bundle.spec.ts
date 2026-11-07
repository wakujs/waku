import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-target-bundle');

test.describe(`ssr-target-bundle`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let fixtureDir: string;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp, fixtureDir } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test.describe('PRD only tests', { tag: '@prd' }, () => {
    test('client bundles exclude the development debug channel', () => {
      const publicDir = path.join(fixtureDir, 'dist', 'public');
      const scripts = readdirSync(publicDir, {
        recursive: true,
        encoding: 'utf8',
      }).filter((file) => file.endsWith('.js'));
      expect(scripts.length).toBeGreaterThan(0);

      for (const file of scripts) {
        const source = readFileSync(path.join(publicDir, file), 'utf8');
        // Protocol strings survive minification even when function names do not.
        expect(
          source.match(/waku:debug-cmd|waku:debug-data|X-Waku-Debug-Id/g),
          file,
        ).toBeNull();
        // This fixture has no application code that generates random IDs.
        expect(source.match(/getRandomValues|randomUUID/g), file).toBeNull();
      }
    });

    test('image exists in folder public/assets', async () => {
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = readdirSync(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('image-not-inlined-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json public linked exists in folder public/assets', async () => {
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = readdirSync(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-public-linked-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json private NOT exists in folder public/assets', async () => {
      const imagePath = path.join(fixtureDir, 'dist', 'public', 'assets');
      const files = readdirSync(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-private-'),
      );
      expect(imageExists).not.toBe(true);
    });
  });

  test('add text input', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
    const height = await page
      .getByTestId('textarea')
      .evaluate((el) => el.clientHeight);
    await page.getByTestId('textarea').fill('Line1\nLine2\nLine3');
    const heightChanged = await page
      .getByTestId('textarea')
      .evaluate((el) => el.clientHeight);
    expect(heightChanged).toBeGreaterThan(height);
  });

  test('image was loaded and JSON results exists', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await page.waitForLoadState('domcontentloaded');
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    page.on('response', (data) => {
      console.log(
        data.status(),
        data.url(),
        data.url() /*.includes('image.png')*/,
      );
    });
    await expect(page.getByTestId('image')).toHaveJSProperty('complete', true);
    await expect(page.getByTestId('image')).not.toHaveJSProperty(
      'naturalWidth',
      0,
    );
    await expect(page.getByTestId('json-private')).toHaveText('6');
    const value = await page
      .getByTestId('json-public-linked')
      .getAttribute('href');
    expect(value).toMatch(/json-public-linked/);
  });

  test('no js environment should have first screen', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
    await page.close();
    await context.close();
  });
});
