import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('rsc-basic');

test.describe(`rsc-basic`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('basic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');

    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('0');
    await page.getByTestId('client-counter').getByTestId('increment').click();
    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('1');
    await page.getByTestId('client-counter').getByTestId('increment').click();
    await expect(
      page.getByTestId('client-counter').getByTestId('count'),
    ).toHaveText('2');
  });

  test('server ping', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');

    await expect(
      page.getByTestId('server-ping').getByTestId('pong'),
    ).toBeEmpty();
    await page.getByTestId('server-ping').getByTestId('ping').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('pong'),
    ).toHaveText('pong');

    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('0');
    await page.getByTestId('server-ping').getByTestId('increase').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('1');
    await page.getByTestId('server-ping').getByTestId('increase').click();
    await expect(
      page.getByTestId('server-ping').getByTestId('counter'),
    ).toHaveText('2');

    await expect(
      page.getByTestId('server-ping').getByTestId('wrapped'),
    ).toBeEmpty();
    await page.getByTestId('server-ping').getByTestId('wrap').click();
    await expect(
      page
        .getByTestId('server-ping')
        .getByTestId('wrapped')
        .locator('.via-server'),
    ).toHaveText('okay');

    // https://github.com/wakujs/waku/issues/1420
    await page
      .getByTestId('server-ping')
      .getByTestId('show-server-data')
      .click();
    await expect(
      page.getByTestId('server-ping').locator('.server-data'),
    ).toHaveText('Server Data');
    expect(
      messages.some((m) =>
        /Cannot update a component \S+ while rendering a different component/.test(
          m,
        ),
      ),
    ).toBe(false);
  });

  test('refetch', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await page.getByTestId('refetch1').click();
    await expect(page.getByTestId('app-name')).toHaveText('foo');
    await page.getByTestId('refetch2').click();
    await expect(page.getByTestId('app-name')).toHaveText('[bar]');
    await page.getByTestId('refetch3').click();
    await expect(page.getByTestId('app-name')).toHaveText('baz/qux');
    await page.getByTestId('refetch4').click();
    await expect(page.getByTestId('app-name')).toHaveText('params');
    await expect(page.getByTestId('refetch-params')).toHaveText(
      '{"foo":"bar"}',
    );
  });

  test('refetch with transition', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/`);
    await page.getByTestId('refetch1').click();
    await expect(page.getByTestId('app-name')).toHaveText('foo');
    await page.getByTestId('refetch5').click();
    await expect(page.getByTestId('refetch-transition')).toHaveText('pending');
    await expect(page.getByTestId('app-name')).toHaveText('with-transition');
    await expect(page.getByTestId('refetch-transition')).toHaveText('idle');
  });

  test('server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await expect(page.getByTestId('ai-internal-provider')).toHaveText(
      'globalThis.actions: ["foo"]',
    );
    const result = await page.evaluate(() => {
      // @ts-expect-error no types
      return globalThis.actions.foo();
    });
    expect(result).toBe(0);
  });

  test('server throws', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await page.getByTestId('server-throws').getByTestId('throws').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText('Something unexpected happened');
  });

  test('server handle network errors', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('app-name')).toHaveText('Waku');
    await page.getByTestId('server-throws').getByTestId('success').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('It worked');
    await page.getByTestId('server-throws').getByTestId('reset').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-success'),
    ).toHaveText('init');
    await stopApp();
    await page.getByTestId('server-throws').getByTestId('success').click();
    await expect(
      page.getByTestId('server-throws').getByTestId('throws-error'),
    ).toHaveText('Failed to fetch');
    ({ port, stopApp } = await startApp(mode));
  });
});
