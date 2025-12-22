/**
 * Smoke tests for all examples.
 * This test will run all examples and check that the title is correct.
 *
 * If you want to run a specific example, you can use VSCode Playwright extension.
 */
import { ChildProcess, exec } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { error, info } from '@actions/core';
import { expect } from '@playwright/test';
import { getAvailablePort, test, waitForPortReady } from './utils.js';

const execAsync = promisify(exec);

const examplesDir = fileURLToPath(new URL('../examples', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const commands = [
  {
    build: undefined,
    command: `node ${waku} dev`,
  },
  {
    build: `build`,
    command: `node ${waku} start`,
  },
] as const;

const commandsCloudflare = [
  {
    build: undefined,
    command: `node ${waku} dev`,
  },
  {
    build: `build`,
    command: 'npx wrangler dev',
  },
] as const;

const examples = [
  ...readdirSync(examplesDir).map((example) =>
    fileURLToPath(new URL(`../examples/${example}`, import.meta.url)),
  ),
  // website isn't part of the examples but it is one of good examples to test here
  fileURLToPath(new URL(`../packages/website`, import.meta.url)),
];

test.describe.configure({ mode: 'parallel' });

for (const cwd of examples) {
  const exampleCommands = cwd.includes('cloudflare')
    ? commandsCloudflare
    : commands;
  for (const { build, command } of exampleCommands) {
    if (command.endsWith('npx wrangler dev') && os.platform() === 'win32') {
      // FIXME npx wrangler dev doesn't work on Windows and we don't know why.
      continue;
    }
    test.describe(`smoke test in ${build ? 'PRD' : 'DEV'}`, () => {
      test.skip(({ mode }) => mode !== (build ? 'PRD' : 'DEV'));
      test.describe(`smoke test on ${basename(cwd)}: ${command}`, () => {
        let port: number;
        let cp: ChildProcess;
        test.beforeAll('remove cache', async () => {
          rmSync(`${cwd}/dist`, { recursive: true, force: true });
        });

        test.beforeAll(async () => {
          if (build) {
            await execAsync(`node ${waku} ${build}`, { cwd });
          }
          port = await getAvailablePort();
          // --port option works for both waku and wrangler
          cp = exec(`${command} --port ${port}`, { cwd });
          cp.stdout?.on('data', (data) => {
            info(`stdout: ${data}`);
            console.log(`stdout: `, `${data}`);
          });
          cp.stderr?.on('data', (data) => {
            error(`stderr: ${data}`);
            console.error(`stderr: `, `${data}`);
          });
          await waitForPortReady(port);
        });

        test.afterAll(async () => {
          cp.kill();
        });

        test('check title', async ({ page }) => {
          await page.goto(`http://localhost:${port}/`);
          // title maybe doesn't ready yet
          await page.waitForLoadState('load');
          await expect.poll(() => page.title()).toMatch(/^Waku/);
        });
      });
    });
  }
}
