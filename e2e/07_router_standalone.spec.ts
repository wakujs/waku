import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

const testMatrix = [{ withSSR: false }] as const;

let standaloneDir: string;
const exampleDir = fileURLToPath(
  new URL('../examples/07_router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function testRouterExample(page: Page, port: number) {
  await waitPort({
    port,
  });
  console.log('go to');
  await page.goto(`http://localhost:${port}`);
  console.log('main content', await page.content());
  console.log('start111');
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  console.log('done111');

  await page.click("a[href='/foo']");
  console.log('foo content', await page.content());

  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  await page.goto(`http://localhost:${port}/foo`);
  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  const backgroundColor = await page.evaluate(() =>
    window.getComputedStyle(document.body).getPropertyValue('background-color'),
  );
  expect(backgroundColor).toBe('rgb(254, 254, 254)');
}

test.describe('07_router standalone', () => {
  test.describe.configure({ mode: 'parallel', retries: 2 });
  test.beforeAll('copy code', async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-07-router-'));
    await cp(exampleDir, standaloneDir, {
      filter: (src) => {
        return !src.includes('node_modules') && !src.includes('dist');
      },
      recursive: true,
    });
    execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
      cwd: wakuDir,
      stdio: 'inherit',
    });
    const name = `waku-${version}.tgz`;
    execSync(`npm install ${join(standaloneDir, name)}`, {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
  });

  testMatrix.forEach(({ withSSR }) => {
    test(`should prod work ${withSSR ? 'with SSR' : ''}`, async ({ page }) => {
      console.log(withSSR);
      test.fixme(withSSR, 'SSR is not working in standalone');
      execSync(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
        {
          cwd: standaloneDir,
          stdio: 'inherit',
        },
      );
      const port = await getFreePort();
      console.log('port', port);
      const cp = exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start`,
        {
          cwd: standaloneDir,
          env: {
            ...process.env,
            PORT: `${port}`,
          },
        },
      );
      debugChildProcess(cp, fileURLToPath(import.meta.url));
      await testRouterExample(page, port);
      await terminate(cp.pid!);
    });

    test(`should dev work ${withSSR ? 'with SSR' : ''}`, async ({ page }) => {
      return
      console.log(`should dev work ${withSSR ? 'with SSR' : ''}`);
      console.log(withSSR);
      test.fixme(withSSR, 'SSR is not working in standalone');
      const port = await getFreePort();
      console.log('port', port);
      const cp = exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev`,
        {
          cwd: standaloneDir,
          env: {
            ...process.env,
            PORT: `${port}`,
          },
        },
      );
      debugChildProcess(cp, fileURLToPath(import.meta.url));
      await testRouterExample(page, port);
      await terminate(cp.pid!);
    });
  });
});
