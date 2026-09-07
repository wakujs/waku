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

test('build fails when static pages throw during prerendering', async () => {
  const error = await execAsync(`node ${waku} build`, { cwd: fixtureDir }).then(
    () => {
      throw new Error('build should fail');
    },
    (e: { stderr: string }) => e,
  );
  // a server component throwing inside Suspense
  expect(error.stderr).toContain('Unexpected error inside Suspense');
  // a client component throwing while React DOM renders the HTML
  expect(error.stderr).toContain('Unexpected error in a client component');
  expect(error.stderr).toContain('Render errors occurred while prerendering');
});
