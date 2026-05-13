import { exec } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { test } from './utils.js';

const execAsync = promisify(exec);

const cwd = fileURLToPath(
  new URL('./fixtures/cloudflare-adapter', import.meta.url),
);
const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const decodeCachedElements = (path: string): string => {
  const meta = readFileSync(path, 'utf-8');
  const match = meta.match(/new Map\((\[.*\])\);?\s*$/s);
  if (!match) {
    throw new Error('cannot parse build metadata');
  }
  const entries = JSON.parse(match[1]!) as [string, string][];
  const cachedJson = entries.find(
    ([k]) => k === 'defineRouter:cachedElements',
  )?.[1];
  if (!cachedJson) {
    throw new Error('no cachedElements in build metadata');
  }
  const cached = JSON.parse(cachedJson) as Record<string, string>;
  return Object.values(cached)
    .map((b64) => Buffer.from(b64, 'base64').toString('utf-8'))
    .join('\n');
};

test.skip(({ browserName }) => browserName !== 'chromium');
test.skip(({ mode }) => mode !== 'PRD');

test.describe('cloudflare adapter', () => {
  // https://github.com/wakujs/waku/issues/2083
  test('embeds _root and _layout output in the build metadata', async () => {
    rmSync(`${cwd}/dist`, { recursive: true, force: true });
    await execAsync(`node ${waku} build`, { cwd, env: process.env });
    const decoded = decodeCachedElements(
      `${cwd}/dist/server/__waku_build_metadata.js`,
    );
    expect(decoded).toContain('ROOT_MARKER');
    expect(decoded).toContain('LAYOUT_MARKER');
  });
});
