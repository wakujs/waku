import { exec } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { getManagedServerEntry } from '../packages/waku/dist/lib/utils/managed.js';
import { makeTempDir, test } from './utils.js';

const execAsync = promisify(exec);

const dryRunList = [
  // without waku.server.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/partial-build', import.meta.url)),
    project: 'partial-build',
  },
  // with waku.server.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/ssr-basic', import.meta.url)),
    project: 'ssr-basic',
  },
];

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

type BuildPlatformTarget = {
  adapter: string;
  clearDirOrFile: string[];
  checkJsonFile?: (dir: string) => boolean;
};

const hasDistServerWranglerMainIndexJs = (dir: string) => {
  const file = join(dir, 'dist', 'server', 'wrangler.json');
  if (!existsSync(file)) {
    return false;
  }
  const json = JSON.parse(readFileSync(file, 'utf-8')) as {
    main?: string;
  };
  return json.main === 'index.js';
};

const buildPlatformTarget: BuildPlatformTarget[] = [
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
    clearDirOrFile: ['dist', 'wrangler.jsonc'],
    checkJsonFile: hasDistServerWranglerMainIndexJs,
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

const ensureServerEntryWithAdapter = (file: string, adapter: string) => {
  const content = existsSync(file)
    ? readFileSync(file, 'utf-8')
    : getManagedServerEntry('src');
  const replaced = content.replace(
    /import adapter from 'waku\/adapters\/default';/,
    `import adapter from 'waku/adapters/${adapter}';`,
  );
  if (replaced === content) {
    throw new Error(`Failed to replace adapter in ${file}`);
  }
  writeFileSync(file, replaced);
};

test.describe.configure({ mode: 'parallel' });

test.skip(
  ({ mode }) => mode !== 'PRD',
  'Build tests are only relevant in production mode.',
);

test.describe(`multi platform builds`, () => {
  for (const { cwd, project } of dryRunList) {
    for (const {
      adapter,
      clearDirOrFile,
      checkJsonFile = () => true,
    } of buildPlatformTarget) {
      test(`build ${project} with ${adapter} should not throw error`, async () => {
        const temp = makeTempDir(project);
        const serverEntryFile = join(temp, 'src', 'waku.server.tsx');
        try {
          cpSync(cwd, temp, { recursive: true });
          ensureServerEntryWithAdapter(serverEntryFile, adapter);
          for (const name of clearDirOrFile) {
            rmSync(join(temp, name), { recursive: true, force: true });
          }
          await expect(
            execAsync(`node ${waku} build ${adapter}`, {
              cwd: temp,
              env: process.env,
            }),
          ).resolves.not.toThrow();
          expect(checkJsonFile(temp)).toBe(true);
        } finally {
          rmSync(temp, { recursive: true, force: true });
        }
      });
    }
  }
});
