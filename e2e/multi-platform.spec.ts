import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { getManagedServerEntry } from '../packages/waku/dist/lib/utils/managed.js';
import { makeTempDir, test } from './utils.js';

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

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const buildPlatformTarget = [
  {
    adapter: 'vercel',
    clearDirOrFile: ['dist', '.vercel'],
  },
  {
    adapter: 'netlify',
    clearDirOrFile: ['dist', 'netlify', 'netlify.toml'],
  },
  {
    adapter: 'cloudflare',
    clearDirOrFile: ['dist', 'wrangler.toml'],
  },
  {
    adapter: 'deno',
    clearDirOrFile: ['dist'],
  },
  {
    adapter: 'aws-lambda',
    clearDirOrFile: ['dist'],
  },
];

const toCamelCase = (str: string) =>
  str.replace(/-([a-z])/g, (g) => g[1]!.toUpperCase());

const changeAdapter = (file: string, adapter: string) => {
  let content = '';
  if (existsSync(file)) {
    content = readFileSync(file, 'utf-8');
  } else {
    // managed mode
    content = getManagedServerEntry({ srcDir: 'src' });
  }
  content = content.replace(
    /^import { nodeAdapter } from '.*?';/,
    `import { ${toCamelCase(adapter)}Adapter as nodeAdapter } from 'waku/adapters/${adapter}';`,
  );
  writeFileSync(file, content);
};

test.describe.configure({ mode: 'parallel' });

test.skip(
  ({ mode }) => mode !== 'PRD',
  'Build tests are only relevant in production mode.',
);

test.describe(`multi platform builds`, () => {
  for (const { cwd, project } of dryRunList) {
    for (const { adapter, clearDirOrFile } of buildPlatformTarget) {
      test(`build ${project} with ${adapter} should not throw error`, async () => {
        const temp = makeTempDir(project);
        cpSync(cwd, temp, { recursive: true });
        changeAdapter(join(temp, 'src', 'server-entry.tsx'), adapter);
        for (const name of clearDirOrFile) {
          rmSync(join(temp, name), { recursive: true, force: true });
        }
        try {
          execSync(`node ${waku} build ${adapter}`, {
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
