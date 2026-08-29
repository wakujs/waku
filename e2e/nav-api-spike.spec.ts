import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { settleNavigateFinished } from './fixtures/nav-api-spike/src/settle-navigate-finished.js';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('nav-api-spike');

const ALLOWED_IMPORT_PREFIXES = [
  'react',
  'waku/minimal/client',
  'waku/router/client-core',
];

const listFixtureSources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const next = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFixtureSources(next));
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name)) {
      files.push(next);
    }
  }
  return files;
};

test.describe('settleNavigateFinished', () => {
  test('resolves when finished fulfills', async () => {
    await expect(
      settleNavigateFinished(Promise.resolve()),
    ).resolves.toBeUndefined();
  });

  test('resolves when finished is missing', async () => {
    await expect(settleNavigateFinished(undefined)).resolves.toBeUndefined();
  });

  test('resolves when finished rejects with AbortError', async () => {
    await expect(
      settleNavigateFinished(
        Promise.reject(new DOMException('Aborted', 'AbortError')),
      ),
    ).resolves.toBeUndefined();
  });

  test('rejects when finished rejects with a failure', async () => {
    const error = new Error('failed');
    await expect(settleNavigateFinished(Promise.reject(error))).rejects.toBe(
      error,
    );
  });
});

test.describe('nav-api-spike imports', () => {
  test('binding imports stay on the L1 surface', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).not.toMatch(
      /client\.tsx|router-state|client-utils|client-core-utils/,
    );
    const specs = [...src.matchAll(/from ['"]([^'"]+)['"]/g)].map(
      (match) => match[1]!,
    );
    expect(specs.length).toBeGreaterThan(0);
    const packageSpecs = specs.filter(
      (spec) => !spec.startsWith('./') && !spec.startsWith('../'),
    );
    expect(packageSpecs.length).toBeGreaterThan(0);
    for (const spec of packageSpecs) {
      expect(
        ALLOWED_IMPORT_PREFIXES.some((prefix) => spec.includes(prefix)),
        spec,
      ).toBe(true);
    }
  });

  test('navigate maps Navigation API finished onto the host contract', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).toContain('settleNavigateFinished(result.finished)');
  });

  test('navigate intercept honors scroll: false', () => {
    const bindingPath = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/nav-binding.tsx', import.meta.url),
    );
    const src = readFileSync(bindingPath, 'utf8');
    expect(src).toContain('info: { scroll: opts.scroll }');
    expect(src).toContain("info?.scroll === false ? { scroll: 'manual' } : {}");
  });

  test('fixture sources import nothing from waku/router/client', () => {
    const root = fileURLToPath(
      new URL('./fixtures/nav-api-spike/src/', import.meta.url),
    );
    const files = listFixtureSources(root);
    expect(files.length).toBeGreaterThan(0);
    // client-core is allowed; this matches the history-binding entry only
    const leak = /from ['"]waku\/router\/client['"]/;
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), file.slice(root.length)).not.toMatch(
        leak,
      );
    }
  });
});

test.describe('nav-api-spike', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('initial render', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home')).toHaveText('Home');
  });

  test('anchor navigation goes through the navigate event', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello spike');
    await expect(page).toHaveURL(/\/hello\/spike$/);
  });

  test('a missing route follows the 404 page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-missing').click();
    await expect(page.getByTestId('not-found')).toHaveText('Custom 404');
  });

  test('useParams and useSearch work under the spike binding', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/hello/spike`);
    await waitForHydration(page);
    await expect(page.getByTestId('params')).toHaveText('spike');
    await page.getByTestId('go-search').click();
    await expect(page.getByTestId('search')).toHaveText('hi');
  });

  test('a lazy Slice renders', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-slice').click();
    await expect(page.getByTestId('slice-clock')).toHaveText('lazy clock');
  });

  test('returning to a static route keeps URL and content in sync', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-static').click();
    await expect(page.getByTestId('static')).toHaveText('Static');
    await page.getByTestId('go-hello').click();
    await expect(page.getByTestId('hello')).toHaveText('Hello spike');
    await page.getByTestId('go-static').click();
    await expect(page).toHaveURL(/\/static$/);
    await expect(page.getByTestId('static')).toHaveText('Static');
  });

  test('setSearch keeps the hash after a hash-only navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.getByTestId('hash-a').click();
    await expect(page).toHaveURL(/\/search\?q=hi#a$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#a');
    await page.getByTestId('hash-b').click();
    await expect(page).toHaveURL(/\/search\?q=hi#b$/);
    await expect(page.getByTestId('host-hash')).toHaveText('#b');
    await page.getByTestId('set-search').click();
    await expect(page).toHaveURL(/\/search\?q=x#b$/);
    await expect(page.getByTestId('search')).toHaveText('x');
  });

  test('an internal redirect updates the address bar', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByTestId('go-old').click();
    await expect(page.getByTestId('redirect-new')).toHaveText('New');
    await expect(page).toHaveURL(/\/new$/);
  });

  test('setSearch does not reset scroll', async ({ page }) => {
    await page.goto(`http://localhost:${port}/search?q=hi`);
    await waitForHydration(page);
    await page.evaluate(() => window.scrollTo(0, 400));
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await page.getByTestId('set-search').evaluate((el: HTMLButtonElement) => {
      el.click();
    });
    await expect(page.getByTestId('search')).toHaveText('x');
    await page.evaluate(() => window.navigation.transition?.finished);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });
});
