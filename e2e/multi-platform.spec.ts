import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';

import { test, makeTempDir } from './utils.js';

const dryRunList = [
  // without server-entry.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/partial-build', import.meta.url)),
    project: 'partial-build',
  },
  // with server-entry.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/ssr-basic', import.meta.url)),
    project: 'ssr-basic',
  },
];

let waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

if (process.env.TEST_VITE_RSC) {
  waku += ` --experimental-vite-rsc`;
}

const buildPlatformTarget = [
  {
    platform: '--with-vercel',
    clearDirOrFile: ['dist', '.vercel'],
  },
  {
    platform: '--with-vercel-static',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-netlify',
    clearDirOrFile: ['dist', 'netlify', 'netlify.toml'],
  },
  {
    platform: '--with-netlify-static',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-cloudflare',
    clearDirOrFile: ['dist', 'wrangler.toml'],
  },
  {
    platform: '--with-partykit',
    clearDirOrFile: ['dist', 'partykit.json'],
  },
  {
    platform: '--with-deno',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-aws-lambda',
    clearDirOrFile: ['dist'],
  },
];

test.describe.configure({ mode: 'parallel' });

test.skip(
  ({ mode }) => mode !== 'PRD',
  'Build tests are only relevant in production mode.',
);

test.describe(`multi platform builds`, () => {
  for (const { cwd, project } of dryRunList) {
    for (const { platform, clearDirOrFile } of buildPlatformTarget) {
      test(`build ${project} with ${platform} should not throw error`, async () => {
        const temp = makeTempDir(project);
        cpSync(cwd, temp, { recursive: true });
        for (const name of clearDirOrFile) {
          rmSync(join(temp, name), { recursive: true, force: true });
        }
        try {
          execSync(`node ${waku} build ${platform}`, {
            cwd: temp,
            env: process.env,
          });
        } catch (error) {
          expect(error).toBeNull();
        }
        rmSync(temp, { recursive: true, force: true });
      });
    }
  }
});
