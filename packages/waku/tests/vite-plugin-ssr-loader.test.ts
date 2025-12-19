import { describe, expect, test } from 'vitest';
import { ssrLoaderPlugin } from '../src/lib/vite-plugins/ssr-loader.js';

/**
 * This test suite focuses on the public behavior of the compiler hint:
 *
 *   unstable_loadSsrModule("<specifier>")
 *
 * - It must be treated like a module specifier (resolved relative to the caller file).
 * - It must be transformed only in the `rsc` environment.
 * - It must create a new SSR rollup input entry so the module is available as an SSR entry
 *   via `import.meta.viteRsc.loadModule("ssr", <entryName>)`.
 */

const createThrowingContext = (environment: { name: string; mode?: string }) =>
  ({
    environment,
    error: (message: string) => {
      throw new Error(message);
    },
  }) as const;

const extractEntryName = (code: string) => {
  const match = code.match(
    /import\.meta\.viteRsc\.loadModule\("ssr",\s*"([^"]+)"\)/,
  );
  expect(match).toBeTruthy();
  return match![1]!;
};

describe('vite-plugin-ssr-loader', () => {
  test('rewrites unstable_loadSsrModule to import.meta.viteRsc.loadModule and registers an SSR input entry', async () => {
    const plugin = ssrLoaderPlugin();

    // This is the mutable Vite environment config object that the plugin is expected to mutate.
    const ssrEnvironmentConfig: any = {};
    plugin.configEnvironment?.('ssr', ssrEnvironmentConfig);

    const input = `\
import { unstable_loadSsrModule } from 'waku/server';

export async function load() {
  const mod = await unstable_loadSsrModule('./ssr-impl');
  return mod;
}
`;

    const output = await plugin.transform?.call(
      createThrowingContext({ name: 'rsc', mode: 'dev' }) as never,
      input,
      '/src/routes/page.tsx',
    );

    expect(output).toBeTruthy();
    const transformed = (output as any).code ?? String(output);
    expect(transformed).toContain('import.meta.viteRsc.loadModule("ssr",');

    const entryName = extractEntryName(transformed);
    expect(entryName).toMatch(/^waku_ssr_[a-f0-9]{12}/);

    expect(ssrEnvironmentConfig.build?.rollupOptions?.input?.[entryName]).toBe(
      `virtual:vite-rsc-waku/ssr-loader-entry?e=${entryName}`,
    );
  });

  test('creates an SSR virtual entry that resolves the specifier from the original caller', async () => {
    const plugin = ssrLoaderPlugin();
    const ssrEnvironmentConfig: any = {};
    plugin.configEnvironment?.('ssr', ssrEnvironmentConfig);

    const input = `\
import { unstable_loadSsrModule } from 'waku/server';
export async function load() {
  return unstable_loadSsrModule('./ssr-impl');
}
`;

    const output = await plugin.transform?.call(
      createThrowingContext({ name: 'rsc', mode: 'dev' }) as never,
      input,
      // use a query/hash to ensure the plugin strips it when tracking the importer
      '/src/routes/page.tsx?unused=1#hash',
    );
    const transformed = (output as any).code ?? String(output);
    const entryName = extractEntryName(transformed);

    const resolveCalls: Array<{ specifier: string; importer: string }> = [];
    const loadOutput = await plugin.load?.call(
      {
        ...createThrowingContext({ name: 'ssr', mode: 'dev' }),
        resolve: async (specifier: string, importer: string) => {
          resolveCalls.push({ specifier, importer });
          return { id: '/resolved/ssr-impl.ts' };
        },
      } as never,
      `\0virtual:vite-rsc-waku/ssr-loader-entry?e=${entryName}`,
    );

    expect(resolveCalls).toEqual([
      { specifier: './ssr-impl', importer: '/src/routes/page.tsx' },
    ]);

    expect(String(loadOutput)).toContain(`import * as __mod from "/resolved/ssr-impl.ts";`);
    expect(String(loadOutput)).toContain(`export * from "/resolved/ssr-impl.ts";`);
  });

  test('skips transform outside the rsc environment', async () => {
    const plugin = ssrLoaderPlugin();
    const ssrEnvironmentConfig: any = {};
    plugin.configEnvironment?.('ssr', ssrEnvironmentConfig);

    const input = `\
import { unstable_loadSsrModule } from 'waku/server';
export const load = () => unstable_loadSsrModule('./ssr-impl');
`;

    const output = await plugin.transform?.call(
      createThrowingContext({ name: 'client', mode: 'dev' }) as never,
      input,
      '/src/routes/page.tsx',
    );
    expect(output).toBeUndefined();
    expect(Object.keys(ssrEnvironmentConfig.build.rollupOptions.input)).toEqual(
      [],
    );
  });

  test('skips transform when unstable_loadSsrModule is not imported from waku/server', async () => {
    const plugin = ssrLoaderPlugin();
    const ssrEnvironmentConfig: any = {};
    plugin.configEnvironment?.('ssr', ssrEnvironmentConfig);

    const input = `\
import { unstable_loadSsrModule } from './local';
export const load = () => unstable_loadSsrModule('./ssr-impl');
`;

    const output = await plugin.transform?.call(
      createThrowingContext({ name: 'rsc', mode: 'dev' }) as never,
      input,
      '/src/routes/page.tsx',
    );
    expect(output).toBeUndefined();
    expect(Object.keys(ssrEnvironmentConfig.build.rollupOptions.input)).toEqual(
      [],
    );
  });

  test('throws if the argument is not a string literal', async () => {
    const plugin = ssrLoaderPlugin();
    const ssrEnvironmentConfig: any = {};
    plugin.configEnvironment?.('ssr', ssrEnvironmentConfig);

    await expect(
      plugin.transform?.call(
        createThrowingContext({ name: 'rsc', mode: 'dev' }) as never,
        `\
import { unstable_loadSsrModule } from 'waku/server';
export const load = () => {
  const x = './ssr-impl';
  return unstable_loadSsrModule(x);
};
`,
        '/src/routes/page.tsx',
      ),
    ).rejects.toThrowError(
      'unstable_loadSsrModule argument must be a string literal',
    );
  });
});
