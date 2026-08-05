import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('a server action can send the browser to another origin', async ({
    page,
  }) => {
    // a second origin that sends no cors headers, which a fetch cannot read
    const other = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Other Origin</h1></body></html>');
    });
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', resolve));
    const otherPort = (other.address() as AddressInfo).port;
    const otherOrigin = `http://127.0.0.1:${otherPort}`;
    try {
      await page.goto(`http://localhost:${port}/external-action`);
      await waitForHydration(page);
      await expect(page.getByRole('heading')).toHaveText(
        'External Action Page',
      );
      await page.getByTestId('to').fill(`${otherOrigin}/landed`);
      await page.locator('text=Leave').click();
      await page.waitForURL(`${otherOrigin}/landed`);
      await expect(page.getByRole('heading')).toHaveText('Other Origin');
    } finally {
      // the browser holds the connection open, and the next test wants the port
      other.closeAllConnections();
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });

  test('a render that redirects off the origin does not fetch it first', async ({
    page,
  }) => {
    // the fixture page names this port, so the second origin is predictable
    const hits: string[] = [];
    const other = createServer((req, res) => {
      hits.push(`${req.headers['sec-fetch-mode'] ?? 'none'} ${req.url}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Other Origin</h1></body></html>');
    });
    await new Promise<void>((resolve, reject) => {
      other.on('error', reject);
      other.listen(39876, '127.0.0.1', resolve);
    });
    try {
      await page.goto(`http://localhost:${port}/`);
      await waitForHydration(page);
      await page.locator("a[href='/external-page']").click();
      await page.waitForURL('http://127.0.0.1:39876/from-render');
      await expect(page.getByRole('heading')).toHaveText('Other Origin');
      // a fetch would arrive as cors, and could not have been read anyway
      expect(hits).toContain('navigate /from-render');
      expect(hits.filter((hit) => !hit.startsWith('navigate '))).toEqual([]);
    } finally {
      // the browser holds the connection open, and the next test wants the port
      other.closeAllConnections();
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });

  test('a redirect thrown after the stream opens still leaves', async ({
    page,
  }) => {
    const hits: string[] = [];
    const other = createServer((req, res) => {
      hits.push(`${req.headers['sec-fetch-mode'] ?? 'none'} ${req.url}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Other Origin</h1></body></html>');
    });
    await new Promise<void>((resolve, reject) => {
      other.on('error', reject);
      // its own port, so a lingering socket cannot fail the other test
      other.listen(39877, '127.0.0.1', resolve);
    });
    try {
      await page.goto(`http://localhost:${port}/`);
      await waitForHydration(page);
      await page.locator("a[href='/external-late']").click();
      await page.waitForURL('http://127.0.0.1:39877/from-late', {
        timeout: 10_000,
      });
      await expect(page.getByRole('heading')).toHaveText('Other Origin');
      expect(hits).toContain('navigate /from-late');
      expect(hits.filter((hit) => !hit.startsWith('navigate '))).toEqual([]);
    } finally {
      // the browser holds the connection open, and the next test wants the port
      other.closeAllConnections();
      await new Promise<void>((resolve) => other.close(() => resolve()));
    }
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access sync page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/sync']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/async']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/action`);
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
    await page.goto(`http://localhost:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
