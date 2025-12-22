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
import {
  getAvailablePort,
  ignoreErrors,
  runShell,
  terminate,
  test,
  waitForPortReady,
} from './utils.js';

const execAsync = promisify(exec);

const examplesDir = fileURLToPath(new URL('../examples', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const commands = [
  {
    commandMode: 'DEV',
    command: `node ${waku} dev`,
  },
  {
    commandMode: 'PRD',
    command: `node ${waku} start`,
  },
] as const;

const commandsCloudflare = [
  {
    commandMode: 'DEV',
    command: `node ${waku} dev`,
  },
  {
    commandMode: 'PRD',
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
  test.describe.serial(`smoke test on ${basename(cwd)}`, () => {
    for (const { commandMode, command } of exampleCommands) {
      if (command.includes('wrangler dev') && os.platform() === 'win32') {
        // FIXME npx wrangler dev doesn't work on Windows and we don't know why.
        continue;
      }
      test.describe(`smoke test in ${commandMode}`, () => {
        test.skip(({ mode }) => mode !== commandMode);
        test.describe(`command: ${command}`, () => {
          let port: number;
          let cp: ChildProcess;

          test.beforeAll(async () => {
            if (commandMode === 'PRD') {
              rmSync(`${cwd}/dist`, { recursive: true, force: true });
              await execAsync(`node ${waku} build`, { cwd });
            }
            port = await getAvailablePort();
            // --port option works for both waku and wrangler
            cp = runShell(`${command} --port ${port}`, cwd);
            cp.stdout?.on('data', (data) => {
              if (ignoreErrors.some((re) => re.test(`${data}`))) {
                return;
              }
              info(`stdout: ${data}`);
              console.log(`stdout: `, `${data}`);
            });
            cp.stderr?.on('data', (data) => {
              if (ignoreErrors.some((re) => re.test(`${data}`))) {
                return;
              }
              error(`stderr: ${data}`);
              console.error(`stderr: `, `${data}`);
            });
            await waitForPortReady(port);
          });

          test.afterAll(async () => {
            await terminate(cp);
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
  });
}
