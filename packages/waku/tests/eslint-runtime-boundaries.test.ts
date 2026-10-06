import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { expect, test } from 'vitest';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
const eslint = new ESLint({
  cwd,
  overrideConfig: {
    languageOptions: {
      parserOptions: { project: false },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
});

const lint = async (file: string, code: string) => {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(cwd, 'packages/waku/src', file),
  });
  return result!.messages.map(({ ruleId }) => ruleId);
};

const lintImport = (file: string, dependency: string) => {
  const path = relative(dirname(file), dependency).split(sep).join('/');
  const specifier = path.startsWith('.') ? path : './' + path;
  return lint(
    file,
    `import * as utility from '${specifier}';\nvoid utility;\n`,
  );
};

test('client consumers import only client and isomorphic utilities', async () => {
  for (const file of [
    'client.ts',
    'minimal/client.ts',
    'minimal/client-runtime.tsx',
    'minimal/client-utils/root-store.ts',
    'lib/vite-entries/entry.browser.tsx',
  ]) {
    expect(await lintImport(file, 'lib/utils-isomorphic/log.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-client/initial-rsc.ts')).toEqual(
      [],
    );
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(
      await lint(file, "import * as fs from 'node:fs';\nvoid fs;\n"),
    ).toEqual(['import/no-nodejs-modules']);
    expect(await lint(file, "void import('fs');\n")).toEqual([
      'import/no-nodejs-modules',
    ]);
    expect(await lint(file, 'void process;\nvoid Buffer;\n')).toEqual([
      'no-restricted-globals',
      'no-restricted-globals',
    ]);
  }
  expect(
    await lint(
      'minimal/client-runtime.tsx',
      "export * from '../lib/utils-server/render.js';\n",
    ),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'lib/vite-entries/entry.browser.tsx',
      "void import('../utils-build/config.js');\n",
    ),
  ).toEqual(['import/no-restricted-paths']);
}, 60_000);

test('server consumers import only server and isomorphic utilities', async () => {
  for (const file of [
    'server.ts',
    'minimal/server.ts',
    'lib/hono/middleware.ts',
    'lib/vite-rsc/handler.ts',
    'lib/vite-rsc/ssr.tsx',
    'lib/vite-entries/entry.server.tsx',
    'lib/vite-entries/entry.ssr.tsx',
  ]) {
    expect(await lintImport(file, 'lib/utils-isomorphic/log.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-client/initial-rsc.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([
      'import/no-restricted-paths',
    ]);
  }
}, 60_000);

test('CLI and Vite tooling can import build and server utilities', async () => {
  for (const file of [
    'vite-plugins.ts',
    'lib/vite-rsc/loader.ts',
    'lib/vite-entries/entry.build.ts',
    'lib/vite-plugins/rsc-devtools.ts',
  ]) {
    expect(await lintImport(file, 'lib/utils-build/config.ts')).toEqual([]);
    expect(await lintImport(file, 'lib/utils-server/render.ts')).toEqual([]);
  }
}, 60_000);

test('Router keeps its public API boundary', async () => {
  expect(
    await lintImport('router/client.tsx', 'lib/utils-isomorphic/log.ts'),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'router/client.tsx',
      "import * as minimal from 'waku/minimal/client';\nvoid minimal;\n",
    ),
  ).toEqual([]);
  expect(
    await lint(
      'router/client.tsx',
      "import * as internals from 'waku/internals';\nvoid internals;\n",
    ),
  ).toEqual(['no-restricted-imports']);
}, 60_000);

test('defineRouter utilities do not depend on their entry point', async () => {
  const file = 'router/define-router-utils/build-handler.tsx';
  expect(
    await lint(
      file,
      "import type { unstable_defineRouter } from '../define-router.js';\nexport type Options = Parameters<typeof unstable_defineRouter>[0];\n",
    ),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      file,
      "import type { unstable_defineRouter } from 'waku/router/server';\nexport type Options = Parameters<typeof unstable_defineRouter>[0];\n",
    ),
  ).toEqual(['no-restricted-imports']);
  expect(
    await lintImport(file, 'router/define-router-utils/route-entries.ts'),
  ).toEqual([]);
}, 60_000);

test('router implementations use the public API of the layer below', async () => {
  for (const file of [
    'router/create-pages.tsx',
    'router/create-pages-utils/config.ts',
    'router/create-pages-utils/route-resolver.ts',
    'router/create-pages-utils/router.ts',
  ]) {
    const specifier = 'waku/router/server';
    expect(
      await lint(
        file,
        `import { unstable_defineRouter } from '${specifier}';\nvoid unstable_defineRouter;\n`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        file,
        `import type { unstable_defineRouter } from '${specifier}';\nexport type Interceptor = NonNullable<Parameters<typeof unstable_defineRouter>[0]['unstable_interceptors']>[number];\n`,
      ),
    ).toEqual([]);
    expect(
      await lint(
        file,
        `export type { HandlerInterceptor } from '${specifier}';\n`,
      ),
    ).toEqual(['no-restricted-imports']);
    expect(await lintImport(file, 'router/define-router.tsx')).toEqual([
      'import/no-restricted-paths',
    ]);
    expect(
      await lint(
        file,
        `import type { HandlerInterceptor } from '${specifier}';\nexport type Interceptor = HandlerInterceptor;\n`,
      ),
    ).toEqual(['no-restricted-imports']);
    expect(
      await lint(
        file,
        `import { createRouterHandlers } from '${specifier}';\nvoid createRouterHandlers;\n`,
      ),
    ).toEqual(['no-restricted-imports']);
    expect(
      await lintImport(file, 'router/define-router-utils/element-cache.ts'),
    ).toEqual(['import/no-restricted-paths']);
  }
  expect(
    await lintImport('router/fs-router.ts', 'router/define-router.tsx'),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lintImport(
      'router/fs-router.ts',
      'router/create-pages-utils/router.ts',
    ),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'router/fs-router.ts',
      "import { createPages } from 'waku/router/server';\nvoid createPages;\n",
    ),
  ).toEqual([]);
  expect(
    await lint(
      'router/fs-router.ts',
      "export type { CreateApi, CreateInterceptor, CreatePage } from 'waku/router/server';\n",
    ),
  ).toEqual([]);
  expect(
    await lintImport('router/fs-router.ts', 'router/create-pages.tsx'),
  ).toEqual(['import/no-restricted-paths']);
  expect(
    await lint(
      'router/fs-router.ts',
      "import { unstable_defineRouter } from 'waku/router/server';\nvoid unstable_defineRouter;\n",
    ),
  ).toEqual(['no-restricted-imports']);
  expect(
    await lint(
      'router/fs-router.ts',
      "import { METHODS } from 'waku/router/server';\nvoid METHODS;\n",
    ),
  ).toEqual(['no-restricted-imports']);
}, 60_000);
