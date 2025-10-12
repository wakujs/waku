import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { FSWatcher, ResolvedConfig, ViteDevServer } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import {
  fsRouterTypegenPlugin,
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/vite-plugins/fs-router-typegen.js';

const root = fileURLToPath(new URL('./fixtures', import.meta.url));

vi.mock('prettier', () => {
  return { format: (x: string) => x, resolveConfig: () => ({}) };
});
vi.mock('node:fs/promises', async (importOriginal) => {
  const mod = await importOriginal();
  return {
    // https://vitest.dev/api/vi.html#vi-mock
    // @ts-expect-error - docs say this should be inferred...
    ...mod,
    writeFile: vi.fn(),
  };
});

async function runTest(
  root: string,
  expectedEntriesGen: string,
  srcDir = 'plugin-fs-router-typegen',
) {
  const plugin = fsRouterTypegenPlugin({
    srcDir,
  });
  expect(plugin.configureServer).toBeDefined();
  expect(typeof plugin.configureServer).toBe('function');
  expect(plugin.configResolved).toBeDefined();
  expect(typeof plugin.configResolved).toBe('function');
  if (
    typeof plugin.configureServer !== 'function' ||
    typeof plugin.configResolved !== 'function'
  ) {
    return;
  }
  await plugin.configResolved?.call(
    {} as never,
    { root } as unknown as ResolvedConfig,
  );
  await plugin.configureServer?.call(
    {} as never,
    {
      watcher: { add: () => {}, on: () => {} } as unknown as FSWatcher,
    } as ViteDevServer,
  );
  await vi.waitFor(async () => {
    if (vi.mocked(writeFile).mock.lastCall === undefined) {
      throw new Error('writeFile not called');
    }
  });
  expect(vi.mocked(writeFile).mock.lastCall?.[1]).toContain(expectedEntriesGen);
}

describe('vite-plugin-fs-router-typegen', () => {
  test('generates valid module names for fs entries', async () => {
    expect(toIdentifier('/_layout.tsx')).toBe('File_Layout');
    expect(toIdentifier('/_root.tsx')).toBe('File_Root');
    expect(toIdentifier('/[category]/[...tags]/index.tsx')).toBe(
      'File_CategoryTagsIndex',
    );
  });

  test('allows unicode characters in module names', async () => {
    expect(toIdentifier('/øné_two_three.tsx')).toBe('File_ØnéTwoThree');
  });

  test('handles collisions of fs entry module names', async () => {
    expect(
      getImportModuleNames([
        '/one-two-three.tsx',
        '/one/two/three.tsx',
        '/one_two_three.tsx',
        '/one__two_three.tsx',
      ]),
    ).toEqual({
      'one-two-three.tsx': 'File_OneTwoThree',
      'one/two/three.tsx': 'File_OneTwoThree_1',
      'one_two_three.tsx': 'File_OneTwoThree_2',
      'one__two_three.tsx': 'File_OneTwoThree_3',
    });
  });

  test('creates the expected imports the generated entries file', async () => {
    await runTest(
      root,
      `// prettier-ignore
import type { getConfig as File_CategoryTagsIndex_getConfig } from './pages/[category]/[...tags]/index';
// prettier-ignore
import type { getConfig as File_Root_getConfig } from './pages/_root';
// prettier-ignore
import type { getConfig as File_Index_getConfig } from './pages/index';
// prettier-ignore
import type { getConfig as File_OneTwoThree_getConfig } from './pages/one-two-three';
// prettier-ignore
import type { getConfig as File_OneTwoThree_1_getConfig } from './pages/one__two_three';
// prettier-ignore
import type { getConfig as File_OneTwoThree_2_getConfig } from './pages/one_two_three';
// prettier-ignore
import type { getConfig as File_ØnéTwoThree_getConfig } from './pages/øné_two_three';`,
    );
  });
});
