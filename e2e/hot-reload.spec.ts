import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup, waitForHydration } from './utils.js';

const startApp = prepareStandaloneSetup('hot-reload');

function modifyFile(
  standaloneDir: string,
  file: string,
  search: string,
  replace: string,
) {
  const content = readFileSync(join(standaloneDir, file), 'utf-8');
  writeFileSync(join(standaloneDir, file), content.replace(search, replace));
}

test.skip(
  ({ mode }) => mode !== 'DEV',
  'HMR is only available in development mode',
);

test.describe('hot reload', () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;
  let standaloneDir: string;
  test.beforeAll(async () => {
    ({ port, stopApp, standaloneDir } = await startApp('DEV'));
  });
  test.afterAll(async () => {
    await stopApp?.();
  });

  test('server and client', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByText('Home Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    // Server component hot reload
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Home Page',
      'Modified Page',
    );
    await expect(page.getByText('Modified Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Client component HMR
    modifyFile(
      standaloneDir,
      'src/components/counter.tsx',
      'Increment',
      'Plus One',
    );
    await expect(page.getByText('Plus One')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('3');
    // Server component hot reload again
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      'Modified Page',
      'Edited Page',
    );
    await expect(page.getByText('Edited Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('3');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('4');
    // Jump to another page and back
    await page.getByTestId('about').click();
    await expect(page.getByText('About Page')).toBeVisible();
    modifyFile(
      standaloneDir,
      'src/pages/about.tsx',
      'About Page',
      'About2 Page',
    );
    await expect(page.getByText('About2 Page')).toBeVisible();
    await page.getByTestId('home').click();
    await expect(page.getByText('Edited Page')).toBeVisible();
    // Modify with a JSX syntax error
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<p>Edited Page</p>',
      '<pEdited Page</p>',
    );
    await page.waitForTimeout(500); // need to wait for possible crash
    modifyFile(
      standaloneDir,
      'src/pages/index.tsx',
      '<pEdited Page</p>',
      '<p>Fixed Page</p>',
    );
    await expect(page.getByText('Fixed Page')).toBeVisible();
  });

  test('css modules', async ({ page }) => {
    await page.goto(`http://localhost:${port}/css-modules`);
    await waitForHydration(page);
    await expect(page.getByTestId('css-modules-header')).toHaveText(
      'CSS Modules',
    );
    const bgColor1 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-header"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor1).toBe('rgb(0, 128, 0)');
    modifyFile(
      standaloneDir,
      'src/pages/css-modules.module.css',
      'background-color: green;',
      'background-color: yellow;',
    );
    await page.waitForTimeout(500); // need to wait for full reload
    const bgColor2 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-header"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor2).toBe('rgb(255, 255, 0)');
  });

  test('css modules in client components with a reload (#1328)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/css-modules-client`);
    await waitForHydration(page);
    await expect(page.getByTestId('css-modules-client')).toHaveText('Hello');
    const bgColor1 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-client"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor1).toBe('rgb(255, 0, 0)');

    modifyFile(
      standaloneDir,
      'src/pages/css-modules-client.module.css',
      'background-color: red;',
      'background-color: blue;',
    );
    await page.waitForTimeout(500); // need to wait for full reload
    const bgColor2 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-client"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor2).toBe('rgb(0, 0, 255)');

    await page.reload();
    await page.waitForTimeout(500); // need to wait?
    const bgColor3 = await page.evaluate(() =>
      window
        .getComputedStyle(
          document.querySelector('[data-testid="css-modules-client"]')!,
        )
        .getPropertyValue('background-color'),
    );
    expect(bgColor3).toBe('rgb(0, 0, 255)');
  });

  test('indirect client components (#1491)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1000');
    // Client component HMR
    modifyFile(
      standaloneDir,
      'src/components/message.tsx',
      'Mesg 1000',
      'Mesg 1001',
    );
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1001');
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Browser refresh
    await page.reload();
    await expect(page.getByTestId('mesg')).toHaveText('Mesg 1001');
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    expect(errors.join('\n')).not.toContain('hydration-mismatch');
  });

  test('restart server when waku config changed', async ({ request }) => {
    const res = await request.get(`http://localhost:${port}/__test_edit`);
    expect(await res.text()).not.toEqual('ok');
    modifyFile(
      standaloneDir,
      'waku.config.ts',
      'defineConfig({})',
      `\
defineConfig({
  vite: {
    plugins: [
      [
        {
          name: 'test',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === "/__test_edit") {
                res.end("ok");
                return;
              }
              next();
            });
          }
        }
      ]
    ]
  }
})
`,
    );
    // wait for restart
    await expect(async () => {
      const res = await request.get(`http://localhost:${port}/__test_edit`);
      expect(await res.text()).toEqual('ok');
    }).toPass();
  });
});
