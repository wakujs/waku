import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  generateFsRouterTypes,
  getImportModuleNames,
  toIdentifier,
} from '../src/lib/vite-plugins/fs-router-typegen.js';

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
    const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen', 'pages'),
    );
    expect(generated).toContain(
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

  test('generates types when server-entry uses fsRouter (managed mode)', async () => {
    vi.mocked(writeFile).mockClear();
    await runTest(
      root,
      `type Page =`,
      'plugin-fs-router-typegen-with-fsrouter',
    );
  });

  test('skips type generation when server-entry does not use fsRouter', async () => {
    vi.mocked(writeFile).mockClear();

    const plugin = fsRouterTypegenPlugin({
      srcDir: 'plugin-fs-router-typegen-with-createpages',
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

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(vi.mocked(writeFile)).not.toHaveBeenCalled();
  });
});
