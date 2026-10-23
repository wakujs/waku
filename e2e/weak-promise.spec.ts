import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('minimal-examples');
const fixtureRequire = createRequire(
  new URL('./fixtures/minimal-examples/package.json', import.meta.url),
);
const expectedVersion = fixtureRequire('react/package.json').version as string;
const weakReference = expectedVersion.startsWith('0.0.0-experimental-')
  ? /"INTENT":"\$w[0-9a-f]+"/
  : /"\$undefined"/;

test.describe('weak promises', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, { host: '127.0.0.1' }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('unused weak data permits EOF, SSR, and hydration with the intended runtime', async ({
    page,
    request,
  }) => {
    const expected = expectedVersion;
    const response = await request.get(
      `http://127.0.0.1:${port}/weak-flight?kind=unused`,
      { timeout: 15_000 },
    );
    expect(response.ok()).toBe(true);
    const payload = await response.text();
    expect(payload).not.toContain('waku-weak-');
    expect(payload).toMatch(weakReference);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/weak?kind=unused`);
    await expect(page.getByTestId('weak-body')).toHaveText('complete');
    await expect(page.getByTestId('weak-intent')).toHaveText('none');
    await expect(page.getByTestId('weak-counter')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await page.getByTestId('weak-counter').click();
    await expect(page.getByTestId('weak-counter')).toHaveText('1');
    const runtime = JSON.parse(
      await page.getByTestId('weak-runtime').innerText(),
    ) as {
      server: {
        react: string;
        reactPackage: string;
        reactDomPackage: string;
        flightPackage: string;
      };
      client: { react: string; reactDom: string };
    };
    for (const value of [
      runtime.server.reactPackage,
      runtime.server.reactDomPackage,
      runtime.server.flightPackage,
    ]) {
      expect(value).toBe(expected);
    }
    expect(runtime.client.react).toBe(runtime.server.react);
    expect(runtime.client.reactDom).toBe(runtime.server.react);
    await expect(page.getByTestId('weak-error')).toBeEmpty();
    expect(errors).toEqual([]);
  });

  test('a weak value arrives after the HTML shell without blocking hydration', async ({
    page,
    request,
  }) => {
    const id = randomUUID();
    await page.goto(`http://127.0.0.1:${port}/weak?kind=late&id=${id}`, {
      waitUntil: 'commit',
    });
    await expect(page.getByTestId('weak-shell')).toHaveText('Weak promise');
    await expect(page.getByTestId('weak-intent')).toHaveText('none');
    await expect(page.getByTestId('weak-counter')).toHaveAttribute(
      'data-hydrated',
      'true',
    );
    await page.getByTestId('weak-counter').click();
    await expect(page.getByTestId('weak-counter')).toHaveText('1');
    expect(
      (
        await request.get(`http://127.0.0.1:${port}/weak-release?id=${id}`)
      ).ok(),
    ).toBe(true);
    await expect(page.getByTestId('weak-intent')).toHaveText('late intent');
    await expect(page.getByTestId('weak-body')).toHaveText('complete');
    await expect(page.getByTestId('weak-error')).toBeEmpty();
  });

  test('a weak value arrives before unrelated ordinary rendering completes', async ({
    page,
    request,
  }) => {
    const id = randomUUID();
    await page.goto(`http://127.0.0.1:${port}/weak?kind=early&id=${id}`, {
      waitUntil: 'commit',
    });
    await expect(page.getByTestId('weak-intent')).toHaveText('early intent');
    await expect(page.getByTestId('weak-loading')).toBeVisible();
    await expect(page.getByTestId('weak-body')).toHaveCount(0);
    expect(
      (
        await request.get(`http://127.0.0.1:${port}/weak-release?id=${id}`)
      ).ok(),
    ).toBe(true);
    await expect(page.getByTestId('weak-body')).toHaveText('complete');
    await expect(page.getByTestId('weak-error')).toBeEmpty();
  });
});
