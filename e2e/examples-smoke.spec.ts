/**
 * Smoke tests for all examples.
 * This test will run all examples and check that the title is correct.
 *
 * If you want to run a specific example, you can use VSCode Playwright extension.
 */
import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { findWakuPort, terminate, test } from './utils.js';
import { error, info } from '@actions/core';

const examplesDir = fileURLToPath(new URL('../examples', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const commands = [
  {
    command: `node ${waku} dev`,
  },
  {
    build: `build`,
    command: `node ${waku} start`,
  },
];

const commandsCloudflare = [
  {
    command: `node ${waku} dev`,
  },
  {
    build: `build --with-cloudflare`,
    command: 'npx wrangler dev',
  },
];

const examples = [
  ...(await readdir(examplesDir)).map((example) =>
    fileURLToPath(new URL(`../examples/${example}`, import.meta.url)),
  ),
  // website isn't part of the examples but it is one of good examples to test here
  fileURLToPath(new URL(`../packages/website`, import.meta.url)),
];

for (const cwd of examples) {
  const exampleCommands = cwd.includes('cloudflare')
    ? commandsCloudflare
    : commands;
  for (const { build, command } of exampleCommands) {
    test.describe(`smoke test on ${basename(cwd)}: ${command}`, () => {
      let cp: ChildProcess | undefined;
      let port: number;
      test.beforeAll('remove cache', async () => {
        await rm(`${cwd}/dist`, {
          recursive: true,
          force: true,
        });
      });

      test.beforeAll(async () => {
        if (build) {
          execSync(`node ${waku} ${build}`, { cwd });
        }
        cp = exec(`${command}`, { cwd });
        cp.stdout?.on('data', (data) => {
          info(`stdout: ${data}`);
          console.log(`stdout: `, `${data}`);
        });
        cp.stderr?.on('data', (data) => {
          if (
            command === 'dev' &&
            /WebSocket server error: Port is already in use/.test(`${data}`)
          ) {
            // ignore this error
            return;
          }
          if (
            /Error: The render was aborted by the server without a reason\..*\/examples\/53_islands\//s.test(
              `${data}`,
            )
          ) {
            // ignore this error
            return;
          }
          error(`stderr: ${data}`);
          console.error(`stderr: `, `${data}`);
        });
        port = await findWakuPort(cp);
      });

      test.afterAll(async () => {
        if (cp?.pid) {
          await terminate(cp.pid);
        }
      });

      test('check title', async ({ page }) => {
        await page.goto(`http://localhost:${port}/`);
        // title maybe doesn't ready yet
        await page.waitForLoadState('load');
        await expect.poll(() => page.title()).toMatch(/^Waku/);
      });
    });
  }
}
