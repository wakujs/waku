import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('custom-library-adapter');

test.describe('custom-library-adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let standaloneDir: string;

  test.beforeAll(async ({ mode }) => {
    if (mode === 'DEV') {
      return;
    }
    ({ port, stopApp, standaloneDir } = await startApp(mode, 'pnpm'));
  });

  test.afterAll(async ({ mode }) => {
    if (mode === 'DEV') {
      return;
    }
    await stopApp();
  });

  test('runs post build from dependency adapter', async ({ page }) => {
    test.skip(
      ({ mode }) => mode !== 'PRD',
      'postBuild runs only in build mode',
    );

    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('custom-adapter-heading')).toHaveText(
      'Hello from custom adapter',
    );

    const summaryPath = join(
      standaloneDir,
      'dist',
      'custom-adapter-post-build.json',
    );
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary).toEqual({
      marker: 'custom-adapter-post-build',
    });
  });
});
