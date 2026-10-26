import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import type { ViteDevServer } from 'vite';
import { describe, expect, test, vi } from 'vitest';
import { resolveConfig } from '../src/lib/utils-build/config.js';
import { combinedPlugins } from '../src/lib/vite-plugins/combined-plugins.js';
import {
  detectFsRouterUsage,
  fsRouterTypegenPlugin,
  generateFsRouterTypes,
  getImportModuleNamesForTest,
  toIdentifierForTest,
} from '../src/lib/vite-plugins/fs-router-typegen.js';

// Run every typegen test under a reversed readdir order to simulate a different
// platform's filesystem; the generated output must stay deterministic (sorted),
// so pages.gen.ts does not churn across operating systems.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readdir: (async (...args: Parameters<typeof actual.readdir>) => {
      const entries = await (
        actual.readdir as (...a: unknown[]) => Promise<unknown>
      )(...args);
      return Array.isArray(entries) ? entries.reverse() : entries;
    }) as typeof actual.readdir,
  };
});

const fixturesDir = fileURLToPath(new URL('./fixtures', import.meta.url));

describe('vite-plugin-fs-router-typegen', () => {
  test('generates valid module names for fs entries', async () => {
    expect(toIdentifierForTest('/_layout.tsx')).toBe('File_Layout');
    expect(toIdentifierForTest('/_root.tsx')).toBe('File_Root');
    expect(toIdentifierForTest('/[category]/[...tags]/index.tsx')).toBe(
      'File_CategoryTagsIndex',
    );
  });

  test('normalizes identifiers with punctuation and leading numbers', async () => {
    expect(toIdentifierForTest('foo.bar.baz.tsx')).toBe('File_FooBarBaz');
    expect(toIdentifierForTest('123abc.tsx')).toBe('File_123abc');
    expect(toIdentifierForTest('__double__underscore__.tsx')).toBe(
      'File_DoubleUnderscore',
    );
  });

  test('allows unicode characters in module names', async () => {
    expect(toIdentifierForTest('/øné_two_three.tsx')).toBe('File_ØnéTwoThree');
  });

  test('handles collisions of fs entry module names', async () => {
    expect(
      getImportModuleNamesForTest([
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

  test('strips leading slashes when computing import module names', async () => {
    expect(
      getImportModuleNamesForTest(['/foo.tsx', '/foo.jsx', 'bar/baz.tsx']),
    ).toEqual({
      'foo.tsx': 'File_Foo',
      'foo.jsx': 'File_Foo_1',
      'bar/baz.tsx': 'File_BarBaz',
    });
  });

  test('creates the expected imports the generated entries file', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen', 'pages'),
      'fsRouter',
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
    // search codecs are derived from getConfig and augmented automatically
    expect(generated).toContain('SearchCodecsForPages');
    expect(generated).toContain(
      'interface SearchCodecsConfig extends SearchCodecsForPages<Page> {}',
    );
    // layout paths (including dynamic ones) are emitted into a Layout union
    expect(generated).toContain('type Layout =');
    expect(generated).toContain("| { path: '/' }");
    expect(generated).toContain("| { path: '/[category]' }");
    expect(generated).toContain('layouts: Layout;');
  });

  test('generates types when waku.server uses fsRouter (managed mode)', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter'),
      ),
    ).toBe('fsRouter');
  });

  test('generates types when no waku.server is present (managed fallback)', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen'),
      ),
    ).toBe('fsRouter');
  });

  test('detects fsRouter even when imported with an alias', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter-alias'),
      ),
    ).toBe('fsRouter');
  });

  test('does not detect fsRouter when imported from non-waku sources', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-fsrouter-fake'),
      ),
    ).toBe(false);
  });

  test('skips type generation when waku.server does not use fsRouter', async () => {
    expect(
      await detectFsRouterUsage(
        path.join(fixturesDir, 'plugin-fs-router-typegen-with-createpages'),
      ),
    ).toMatchInlineSnapshot(`false`);
  });

  test('detects mixed routing with different globs without warnings', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'waku-mixed-typegen-'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const entry = path.join(dir, 'waku.server.tsx');
      await writeFile(
        entry,
        `import { createPages } from 'waku/router/server';
        export default createPages(async ({ unstable_createFileRoutes }) => {
          await unstable_createFileRoutes(import.meta.glob('./pages/**/*.{tsx,ts}'));
          return [];
        });`,
      );
      expect(await detectFsRouterUsage(dir)).toBe('unstable_createFileRoutes');
      await writeFile(
        entry,
        `import { createPages } from 'waku/router/server';
        export default createPages(async ({ unstable_createFileRoutes }) => {
          await unstable_createFileRoutes(import.meta.glob('./pages/**/*.tsx'));
          await unstable_createFileRoutes(import.meta.glob('./other/**/*.tsx'));
          return [];
        });`,
      );
      expect(await detectFsRouterUsage(dir)).toBe('unstable_createFileRoutes');
      expect(warning).not.toHaveBeenCalled();
    } finally {
      warning.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('detects unstable_createFileRoutes but not called', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'waku-mixed-typegen-'));
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const entry = path.join(dir, 'waku.server.tsx');
      await writeFile(
        entry,
        `import { createPages } from 'waku/router/server';
        export default createPages(async ({ unstable_createFileRoutes }) => {
          return [];
        });`,
      );
      expect(await detectFsRouterUsage(dir)).toBe(false);
    } finally {
      warning.mockRestore();
      await rm(dir, { recursive: true, force: true });
    }
  });

  test.each([
    "import.meta.glob('./other/**/*.tsx')",
    "import.meta.glob('./pages/**/*.tsx'), {}",
    "import.meta.glob('./pages/**/*.tsx'), { pagesDir: 'pages', apiDir: 'api', slicesDir: 'slices', interceptorsDir: 'interceptors' }",
    'modules',
    'modules, options',
  ])(
    'detects mixed routing without restricting arguments: %s',
    async (args) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'waku-mixed-typegen-'));
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
      try {
        await writeFile(
          path.join(dir, 'waku.server.tsx'),
          `
        import { createPages as pages } from 'waku';
        export default pages(async ({ unstable_createFileRoutes }) => {
          await unstable_createFileRoutes(${args});
          return [];
        });
      `,
        );
        expect(await detectFsRouterUsage(dir)).toBe(
          'unstable_createFileRoutes',
        );
        expect(warning).not.toHaveBeenCalled();
      } finally {
        warning.mockRestore();
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test.each(['fsRouter', 'unstable_createFileRoutes'] as const)(
    'Vite generates fresh output in %s mode',
    async (mode) => {
      const dir = await mkdtemp(path.join(tmpdir(), 'waku-typegen-plugin-'));
      try {
        await mkdir(path.join(dir, 'pages'));
        await writeFile(
          path.join(dir, 'pages/index.tsx'),
          'export default () => null;',
        );
        if (mode === 'unstable_createFileRoutes') {
          await writeFile(
            path.join(dir, 'waku.server.tsx'),
            `
            import { createPages as pages } from 'waku';
            export default pages(async ({ unstable_createFileRoutes }) => {
              await unstable_createFileRoutes(import.meta.glob('./pages/**/*.tsx'));
              return [];
            });
          `,
          );
        }
        const plugin = fsRouterTypegenPlugin({ srcDir: '.' });
        const configure = plugin.configureServer;
        if (typeof configure !== 'function') {
          throw new Error('Missing configureServer');
        }
        await configure.call(
          {} as never,
          {
            config: { root: dir },
            watcher: { on: vi.fn() },
          } as unknown as ViteDevServer,
        );
        const output = path.join(dir, 'pages.gen.ts');
        await vi.waitFor(async () => {
          const generated = await readFile(output, 'utf8');
          expect(generated).toContain("path: '/'");
          if (mode === 'unstable_createFileRoutes') {
            expect(generated).toContain('export type FilePages = Page;');
            expect(generated).not.toContain('declare module');
          } else {
            expect(generated).toContain("declare module 'waku/router'");
          }
        });
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
  );

  test('exports mixed metadata without conflicting automatic registrations', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen-complex', 'pages'),
      'unstable_createFileRoutes',
    );
    expect(generated).toContain('export type FilePages = Page;');
    expect(generated).toContain('export type FileLayouts = Layout;');
    expect(generated).not.toContain('declare module');
    expect(generated).not.toContain('PathsForPages');
    expect(generated).not.toContain('SearchCodecsForPages');
  });

  test('emits never for mixed layout-only metadata', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'waku-mixed-typegen-'));
    try {
      const pages = path.join(dir, 'pages');
      await mkdir(pages);
      await writeFile(
        path.join(pages, '_layout.tsx'),
        'export default () => null;',
      );
      const generated = await generateFsRouterTypes(
        pages,
        'unstable_createFileRoutes',
      );
      expect(generated).toContain('type Page =\nnever;');
      expect(generated).toContain('export type FileLayouts = Layout;');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test('combines explicit and file paths before the empty-router fallback', () => {
    const fileName = path.join(fixturesDir, '../mixed-route-typecheck.ts');
    const source = `
      import type { PathsForPages, RouteConfig } from '../src/router/base-types.js';
      import { Link, useRouter } from '../src/router/client.js';
      type FilePages = { path: '/file'; render: 'static' } |
        { path: '/blog/[slug]'; render: 'static'; staticPaths: readonly ['one', 'two'] };
      type Router = { DO_NOT_USE_pages: { path: '/explicit'; render: 'static' } };
      declare module '../src/router/base-types.js' {
        interface RouteConfig { paths: PathsForPages<Router, FilePages> }
      }
      const file: RouteConfig['paths'] = '/file';
      const explicit: RouteConfig['paths'] = '/explicit';
      const slug: RouteConfig['paths'] = '/blog/one';
      // @ts-expect-error not a registered route
      const invalid: RouteConfig['paths'] = '/missing';
      // @ts-expect-error not a declared static slug
      const invalidSlug: RouteConfig['paths'] = '/blog/three';
      type Empty = { DO_NOT_USE_pages: never };
      const fileOnly: PathsForPages<Empty, FilePages> = '/file';
      // @ts-expect-error empty explicit routes must not widen file routes
      const invalidFileOnly: PathsForPages<Empty, FilePages> = '/missing';
      const fallback: PathsForPages<Empty> = '/anything';
      Link({ to: '/file', children: null });
      Link({ to: '/explicit', children: null });
      useRouter().push('/file');
      useRouter().replace('/explicit');
      useRouter().prefetch('/blog/one');
      // @ts-expect-error Link rejects unregistered routes
      Link({ to: '/missing', children: null });
      // @ts-expect-error push rejects unregistered routes
      useRouter().push('/missing');
      // @ts-expect-error replace rejects unregistered routes
      useRouter().replace('/missing');
      // @ts-expect-error prefetch rejects unregistered routes
      useRouter().prefetch('/missing');
    `;
    const options: ts.CompilerOptions = {
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      jsx: ts.JsxEmit.ReactJSX,
    };
    const host = ts.createCompilerHost(options);
    const getSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (
      name,
      languageVersion,
      onError,
      shouldCreateNewSourceFile,
    ) =>
      name === fileName
        ? ts.createSourceFile(name, source, languageVersion, true)
        : getSourceFile(
            name,
            languageVersion,
            onError,
            shouldCreateNewSourceFile,
          );
    const program = ts.createProgram([fileName], options, host);
    // Check the consumer independently of runtime source build configuration.
    const diagnostics = ts.getPreEmitDiagnostics(
      program,
      program.getSourceFile(fileName),
    );
    expect(
      diagnostics.map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
      ),
    ).toEqual([]);
  });

  test('skips built-in Waku plugin when user plugin overrides it', async () => {
    const pluginName = 'waku:vite-plugins:build-id';
    const plugins = combinedPlugins(
      resolveConfig({
        vite: {
          plugins: [{ name: pluginName }],
        },
      }),
    );
    const flatPlugins = [plugins].flat(2);
    expect(
      flatPlugins.filter(
        (plugin) =>
          plugin &&
          typeof plugin === 'object' &&
          'name' in plugin &&
          plugin.name === pluginName,
      ),
    ).toHaveLength(1);
  });

  test('returns undefined when there are no page files to scan', async () => {
    expect(
      await generateFsRouterTypes(
        path.join(fixturesDir, 'plugin-fs-router-typegen-empty', 'pages'),
        'fsRouter',
      ),
    ).toBeUndefined();
  });

  test('exports never metadata for an empty mixed pages directory', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen-empty', 'pages'),
      'unstable_createFileRoutes',
    );
    expect(generated).toContain('type Page =\nnever;');
    expect(generated).toContain('export type FilePages = Page;');
    expect(generated).toContain('export type FileLayouts = never;');
    expect(generated).not.toContain('declare module');
  });

  test('skips getConfig imports for pages without getConfig', async () => {
    const generated = await generateFsRouterTypes(
      path.join(
        fixturesDir,
        'plugin-fs-router-typegen-missing-getconfig',
        'pages',
      ),
      'fsRouter',
    );

    expect(generated).not.toContain('GetConfigResponse');
    expect(generated).not.toContain('_getConfig');
    expect(generated).not.toContain('SearchCodecsConfig');
    expect(generated).not.toContain('\n\n\n');
    expect(generated).toContain("| { path: '/'; render: 'static' }");
    expect(generated).toContain("| { path: '/about'; render: 'static' }");
  });

  test('emits page and layout paths while skipping ignored files and missing getConfig', async () => {
    const generated = await generateFsRouterTypes(
      path.join(fixturesDir, 'plugin-fs-router-typegen-complex', 'pages'),
      'fsRouter',
    );

    expect(generated).toBeTruthy();
    expect(generated).toContain(
      `import type { getConfig as File_GroupLandingIndex_getConfig } from './pages/(group)/landing/index';`,
    );
    expect(generated).toContain(
      `import type { getConfig as File_AdminDashboard_getConfig } from './pages/admin/dashboard';`,
    );
    expect(generated).toContain(
      `import type { getConfig as File_DocsIndex_getConfig } from './pages/docs/index';`,
    );
    // layout files are not imported and their filename is never leaked
    expect(generated).not.toContain('_layout');
    expect(generated).not.toContain('_actions');
    expect(generated).not.toContain('_components');
    expect(generated).not.toContain('_hooks');
    expect(generated).toContain(
      "| ({ path: '/landing' } & GetConfigResponse<typeof File_GroupLandingIndex_getConfig>)",
    );
    expect(generated).toContain(
      "| ({ path: '/docs' } & GetConfigResponse<typeof File_DocsIndex_getConfig>)",
    );
    expect(generated).toContain(
      "| ({ path: '/admin/dashboard' } & GetConfigResponse<typeof File_AdminDashboard_getConfig>)",
    );
    expect(generated).toContain("| { path: '/blog/[slug]'; render: 'static' }");
    // the layout at docs/_layout.tsx is emitted as a layout path
    expect(generated).toContain('type Layout =');
    expect(generated).toContain("| { path: '/docs' }");
    expect(generated).toContain('layouts: Layout;');
    expect(generated).toContain("declare module 'waku/router'");
  });
});
