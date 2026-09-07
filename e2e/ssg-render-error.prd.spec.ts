import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { test } from './utils.js';

const execAsync = promisify(exec);
const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);
const fixtureDir = fileURLToPath(
  new URL('./fixtures/ssg-render-error', import.meta.url),
);

test('build fails when a static page throws inside Suspense', async () => {
  await expect(
    execAsync(`node ${waku} build`, { cwd: fixtureDir }),
  ).rejects.toMatchObject({
    stderr: expect.stringMatching(
      /Unexpected error inside Suspense[^]*1 error occurred while prerendering/,
    ),
  });
});
