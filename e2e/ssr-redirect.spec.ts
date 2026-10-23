import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let otherOrigin: string;
  let other: Server;
  const hits: string[] = [];
  const serverOutput: string[] = [];
  const notFoundGate = Promise.withResolvers<void>();
  const redirectGate = Promise.withResolvers<void>();

  test.beforeAll(async ({ mode }) => {
    // a second origin that sends no cors headers, which a fetch cannot read
    other = createServer((req, res) => {
      if (req.url === '/redirect-gate') {
        return redirectGate.promise.then(() => res.end());
      }
      if (req.url === '/not-found-gate') {
        void notFoundGate.promise.then(() => res.end());
        return;
      }
      hits.push(`${req.method} ${req.headers.origin ?? 'none'} ${req.url}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Other Origin</h1></body></html>');
    });
    await new Promise<void>((resolve, reject) => {
      other.once('error', reject);
      other.listen(0, '127.0.0.1', resolve);
    });
    otherOrigin = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
    // an ephemeral port, so two projects running this spec cannot collide
    process.env.WAKU_E2E_EXTERNAL_ORIGIN = otherOrigin;
    ({ port, stopApp } = await startApp(mode, {
      host: '127.0.0.1',
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.beforeEach(() => {
    hits.length = 0;
  });

  test.afterAll(async () => {
    delete process.env.WAKU_E2E_EXTERNAL_ORIGIN;
    other.closeAllConnections();
    await new Promise<void>((resolve) => other.close(() => resolve()));
    await stopApp();
  });

  test('normal-return redirect has a real pre-shell HTTP status', async ({
    request,
  }) => {
    const response = await request.get(`http://127.0.0.1:${port}/intent`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('/destination');
  });

  test('discarding a redirect response with pending rendering is quiet', async ({
    page,
    request,
  }) => {
    const outputStart = serverOutput.length;
    const response = await request.get(
      `http://127.0.0.1:${port}/intent-pending`,
      { maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('/destination');
    await page.goto(`http://127.0.0.1:${port}/intent-pending`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    expect(serverOutput.slice(outputStart).join('')).not.toContain(
      'Error during rendering',
    );
  });

  test('static normal-return redirect follows after hydration', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/intent-static`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/destination`);
  });

  test('flat pass-through preserves opaque action values and client props', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/intent-opaque`);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Echo opaque reference' }).click();
    await expect(page.getByTestId('opaque-value')).toHaveText(
      'same opaque value',
    );
    await expect(page.getByTestId('opaque-prop')).toHaveText(
      'same opaque prop',
    );
  });

  test('normal-return notFound produces HTTP 404 and the custom page', async ({
    request,
  }) => {
    const response = await request.get(
      `http://127.0.0.1:${port}/intent-missing`,
    );
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Custom Not Found');
  });

  test('flat route intents follow during client navigation', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await page
      .getByRole('link', { name: 'Intent Redirect', exact: true })
      .click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/destination`);
  });

  test('flat notFound intents preserve the requested URL', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await page
      .getByRole('link', { name: 'Intent Missing', exact: true })
      .click();
    await expect(page.getByRole('heading')).toHaveText('Custom Not Found');
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/intent-missing`);
  });

  test('late normal-return redirect follows in the browser after the shell', async ({
    page,
  }) => {
    const response = await page.goto(`http://127.0.0.1:${port}/intent-late`, {
      waitUntil: 'commit',
    });
    try {
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading')).toHaveText(
        'Intent redirect shell',
      );
    } finally {
      redirectGate.resolve();
    }
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await expect(page).toHaveURL(`http://127.0.0.1:${port}/destination`);
  });

  test('late notFound shows the custom page after the shell', async ({
    page,
  }) => {
    const response = await page.goto(
      `http://127.0.0.1:${port}/intent-late-missing`,
      { waitUntil: 'commit' },
    );
    try {
      expect(response?.status()).toBe(200);
      await expect(page.getByRole('heading')).toHaveText(
        'Intent not-found shell',
      );
    } finally {
      notFoundGate.resolve();
    }
    await expect(page.getByRole('heading')).toHaveText('Custom Not Found');
    await expect(page).toHaveURL(
      `http://127.0.0.1:${port}/intent-late-missing`,
    );
  });

  test('normal-return action redirects with and without JavaScript', async ({
    browser,
  }) => {
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled });
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/intent-action`);
        if (javaScriptEnabled) {
          await waitForHydration(page);
        }
        await page
          .getByRole('button', { name: 'Intent redirect action' })
          .click();
        await expect(page.getByRole('heading')).toHaveText('Destination Page');
      } finally {
        await context.close();
      }
    }
  });

  test('normal-return action notFound shows the custom page at the posted URL', async ({
    browser,
  }) => {
    for (const javaScriptEnabled of [true, false]) {
      const context = await browser.newContext({ javaScriptEnabled });
      try {
        const page = await context.newPage();
        await page.goto(`http://127.0.0.1:${port}/intent-action-missing`);
        if (javaScriptEnabled) {
          await waitForHydration(page);
        }
        const posted = page.waitForResponse(
          (response) => response.request().method() === 'POST',
        );
        await page
          .getByRole('button', { name: 'Missing action', exact: true })
          .click();
        expect((await posted).status()).toBe(javaScriptEnabled ? 200 : 404);
        await expect(page.getByRole('heading')).toHaveText('Custom Not Found');
        await expect(page).toHaveURL(
          `http://127.0.0.1:${port}/intent-action-missing`,
        );
      } finally {
        await context.close();
      }
    }
  });

  test('a server action can send the browser to another origin', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/external-action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('External Action Page');
    await page.getByTestId('to').fill(`${otherOrigin}/landed`);
    await page.locator('text=Leave').click();
    await page.waitForURL(`${otherOrigin}/landed`);
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
  });

  test('a render that redirects off the origin does not fetch it first', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await page.locator("a[href='/external-page']").click();
    await page.waitForURL(`${otherOrigin}/from-render`);
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
    // only a fetch sends an origin, and it could not have read the answer
    expect(hits.filter((hit) => hit.endsWith(' /from-render'))).toEqual([
      'GET none /from-render',
    ]);
  });

  test('a no js form that leaves does not replay the post', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(`http://127.0.0.1:${port}/external-action`);
      await page.getByTestId('to').fill(`${otherOrigin}/landed-nojs`);
      await page.locator('text=Leave').click();
      await page.waitForURL(`${otherOrigin}/landed-nojs`);
      await expect(page.getByRole('heading')).toHaveText('Other Origin');
      // a 307 would send the form body to the other site along with it
      expect(hits.filter((hit) => hit.endsWith(' /landed-nojs'))).toEqual([
        'GET none /landed-nojs',
      ]);
    } finally {
      await context.close();
    }
  });

  test('a redirect thrown after the stream opens still leaves', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await page.locator("a[href='/external-late']").click();
    await page.waitForURL(`${otherOrigin}/from-late`, { timeout: 10_000 });
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
    expect(hits.filter((hit) => hit.endsWith(' /from-late'))).toEqual([
      'GET none /from-late',
    ]);
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access sync page with client navigation', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/sync']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/async']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://127.0.0.1:${port}/action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action (no js)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    await page.goto(`http://127.0.0.1:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
