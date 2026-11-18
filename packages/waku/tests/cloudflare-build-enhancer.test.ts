import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import buildEnhancer from '../src/adapters/cloudflare-build-enhancer.js';
import type { BuildOptions } from '../src/adapters/cloudflare-build-enhancer.js';

const options: BuildOptions = {
  srcDir: 'src',
  distDir: 'dist',
  DIST_PUBLIC: 'public',
  serverless: true,
  buildTokenVar: 'BUILD_TOKEN',
};
const previewConfigFile = path.join('dist', 'server', 'wrangler.json');
const previewConfig = JSON.stringify({ name: 'app', vars: { GREETING: 'hi' } });
const readPreviewConfig = () => readFileSync(previewConfigFile, 'utf-8');

const cwd = process.cwd();

beforeEach(() => {
  process.chdir(mkdtempSync(path.join(tmpdir(), 'waku-cloudflare-')));
  mkdirSync(path.dirname(previewConfigFile), { recursive: true });
  writeFileSync(previewConfigFile, previewConfig);
});

afterEach(() => {
  process.chdir(cwd);
});

test('gives the preview worker a build token only while the build runs', async () => {
  let seen: { buildToken: string | undefined; vars: unknown } | undefined;
  const build = await buildEnhancer(async (_utils, { buildToken }) => {
    seen = { buildToken, vars: JSON.parse(readPreviewConfig()).vars };
  });
  await build(undefined, options);
  expect(seen?.buildToken).toMatch(/^[0-9a-f]{32}$/);
  expect(seen?.vars).toEqual({ GREETING: 'hi', BUILD_TOKEN: seen?.buildToken });
  expect(readPreviewConfig()).toBe(previewConfig);
});

test('removes the build token when the build fails', async () => {
  const build = await buildEnhancer(async () => {
    throw new Error('build failed');
  });
  await expect(build(undefined, options)).rejects.toThrow('build failed');
  expect(readPreviewConfig()).toBe(previewConfig);
});
