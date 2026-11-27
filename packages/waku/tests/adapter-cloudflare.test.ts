import { afterEach, expect, test, vi } from 'vitest';

vi.mock('@vitejs/plugin-rsc/rsc/server', () => ({
  createTemporaryReferenceSet: () => new Map(),
  decodeAction: vi.fn(),
  decodeFormState: vi.fn(),
  decodeReply: vi.fn(),
  loadServerAction: vi.fn(),
  renderToReadableStream: vi.fn(),
}));
vi.mock('virtual:vite-rsc-waku/build-metadata', () => ({
  buildMetadata: new Map(),
}));
vi.mock('virtual:vite-rsc-waku/config', async () => {
  const { resolveConfig } = await import('../src/lib/utils-build/config.js');
  return { config: resolveConfig({}), isBuild: true };
});
vi.mock('waku/adapter-builders', () => import('../src/adapter-builders.js'));
vi.mock('waku/internals', () => import('../src/internals.js'));
vi.mock('cloudflare:workers', () => ({
  env: {},
  waitUntil: () => {},
  passThroughOnException: () => {},
}));

const buildPath = 'http://localhost/__waku_internal_build_static_files';
const tokenHeader = 'x-waku-internal-build-token';

const createEntry = async () => {
  const { default: adapter } = await import('../src/adapters/cloudflare.js');
  const handleBuild = vi.fn(async () => {});
  const entry = adapter({ handleRequest: async () => null, handleBuild });
  return { entry, handleBuild };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

test('serves the static build only for the token in the worker env', async () => {
  const { entry, handleBuild } = await createEntry();
  const env = { WAKU_INTERNAL_BUILD_TOKEN: 'token' };
  const request = (headers: Record<string, string>) =>
    entry.fetch(new Request(buildPath, { headers }), env);

  for (const headers of [
    {},
    { [tokenHeader]: 'other' },
    { [tokenHeader]: 'token', 'cf-visitor': '{"scheme":"https"}' },
  ]) {
    expect((await request(headers)).status, JSON.stringify(headers)).toBe(404);
  }
  expect(
    (await entry.fetch(new Request(buildPath), {})).status,
    'no token in env',
  ).toBe(404);
  expect(handleBuild).not.toHaveBeenCalled();

  const response = await request({ [tokenHeader]: 'token' });
  await response.arrayBuffer();
  expect(response.status).toBe(200);
  expect(handleBuild).toHaveBeenCalledOnce();
});

test('closes the preview server when the build request fails', async () => {
  const { entry } = await createEntry();
  const close = vi.fn(async () => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(null, { status: 404 })),
  );
  await expect(
    entry.build(
      {
        emitFile: vi.fn(),
        unstable_registerPrunableFile: vi.fn(),
        unstable_startPreviewServer: async () => ({
          baseUrl: 'http://localhost:4173/',
          middlewares: { use: () => {} },
          close,
        }),
      },
      { buildToken: 'token' },
    ),
  ).rejects.toThrow('Static file build request failed with 404');
  expect(close).toHaveBeenCalledOnce();
});
