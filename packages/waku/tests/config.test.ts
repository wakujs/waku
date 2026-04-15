import { expectType } from 'ts-expect';
import { afterEach, expect, test, vi } from 'vitest';
import { type Config, defineConfig } from '../src/config.js';
import { loadConfig } from '../src/lib/vite-rsc/loader.js';

const { existsSyncMock, runnerImportMock } = vi.hoisted(() => ({
  existsSyncMock: vi.fn<(path: string) => boolean>(),
  runnerImportMock: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
}));

vi.mock('vite', () => ({
  runnerImport: runnerImportMock,
}));

afterEach(() => {
  vi.clearAllMocks();
});

test('defineConfig with object', () => {
  expect(defineConfig({})).toEqual({});
  expect(defineConfig({ basePath: '/app/' })).toEqual({ basePath: '/app/' });
});

test('defineConfig with callback', () => {
  const fn = () => ({});
  expect(defineConfig(fn)).toBe(fn);
});

test('loadConfig with callback config export', async () => {
  existsSyncMock.mockImplementation((path) => path === 'waku.config.ts');
  const configExport = vi.fn(
    async ({ cmd }: { cmd: 'dev' | 'build' | 'start' }) => ({
      basePath: `/${cmd}/`,
      srcDir: 'app',
    }),
  );
  runnerImportMock.mockResolvedValue({
    module: { default: defineConfig(configExport) },
  });

  await expect(loadConfig('build')).resolves.toMatchObject({
    basePath: '/build/',
    srcDir: 'app',
    distDir: 'dist',
    privateDir: 'private',
    rscBase: 'RSC',
    vite: undefined,
  });
  expect(existsSyncMock).toHaveBeenCalledWith('waku.config.ts');
  expect(runnerImportMock).toHaveBeenCalledWith('/waku.config');
  expect(configExport).toHaveBeenCalledWith({ cmd: 'build' });
});

// Type tests
type ConfigExport =
  | Config
  | ((param: { cmd: 'dev' | 'build' | 'start' }) => Config | Promise<Config>);
expectType<ConfigExport>(defineConfig({}));
expectType<ConfigExport>(defineConfig(() => ({})));
expectType<ConfigExport>(defineConfig(async () => ({})));

// @ts-expect-error This is supposed to verify ts-expect works.
expectType<undefined>(defineConfig({}));
