import { afterEach, expect, test, vi } from 'vitest';
import type { Unstable_Handlers as Handlers } from '../src/lib/types.js';
import { cancelRender } from '../src/lib/utils-isomorphic/render-cancellation.js';
import { createServerEntryAdapter } from '../src/lib/vite-rsc/handler.js';

const mocks = vi.hoisted(() => ({
  render: vi.fn(
    (_data: unknown, _options?: object) =>
      new ReadableStream({ start: (c) => c.close() }),
  ),
}));
vi.mock('@vitejs/plugin-rsc/rsc/server', () => ({
  createTemporaryReferenceSet: () => new Map(),
  decodeAction: vi.fn(),
  decodeFormState: vi.fn(),
  decodeReply: vi.fn(),
  loadServerAction: vi.fn(),
  renderToReadableStream: mocks.render,
}));
vi.mock('virtual:vite-rsc-waku/build-metadata', () => ({
  buildMetadata: new Map(),
}));
vi.mock('virtual:vite-rsc-waku/config', async () => {
  const { resolveConfig } = await import('../src/lib/utils-build/config.js');
  return { config: resolveConfig({}), isBuild: false };
});
vi.mock('virtual:vite-rsc-waku/not-found', () => ({ default: 'Not Found' }));

type Runtime = Parameters<Parameters<typeof createServerEntryAdapter>[0]>[0];
const runtime = (
  handleRequest: Handlers['handleRequest'],
  handleBuild: Handlers['handleBuild'] = async () => {},
) => {
  let result!: Runtime;
  createServerEntryAdapter((args) => {
    result = args;
    return { fetch: async () => new Response(), build: async () => {} };
  })({ handleRequest, handleBuild });
  return result;
};

afterEach(() => vi.restoreAllMocks());

test.each([
  { method: 'GET', headers: {}, status: 405 },
  { method: 'POST', headers: { origin: 'https://other.example' }, status: 403 },
])(
  'returns $status when action parsing rejects $method',
  async ({ method, headers, status }) => {
    const handle = vi.fn();
    const response = await runtime(handle).processRequest(
      new Request('https://app.example/RSC/F/actions/save.txt', {
        method,
        headers,
        ...(method === 'POST' ? { body: '[]' } : {}),
      }),
    );
    expect(response?.status).toBe(status);
    expect(handle).not.toHaveBeenCalled();
  },
);

test('returns an HTTP rejection without encoding it in Flight', async () => {
  const rejected = new Response('Bad Request', { status: 400 });
  const { processRequest } = runtime(async () => {
    throw rejected;
  });
  expect(await processRequest(new Request('https://app.example/page'))).toBe(
    rejected,
  );
});

test('reports an ordinary handler failure as a generic 500', async () => {
  const error = new Error('private details');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const { processRequest } = runtime(async () => {
    throw error;
  });
  const response = await processRequest(
    new Request('https://app.example/page'),
  );
  expect(response?.status).toBe(500);
  expect(await response?.text()).toBe('Internal Server Error');
  expect(warning).toHaveBeenCalledOnce();
});

test('only cancellation has a framework-supplied Flight digest', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { processRequest } = runtime(async (_input, utils) => {
    return utils.renderRsc({});
  });
  await processRequest(new Request('https://app.example/RSC/widget.txt'));
  const options = mocks.render.mock.calls.at(-1)![1] as {
    onError: (error: unknown) => string | undefined;
  };
  try {
    cancelRender();
  } catch (error) {
    expect(options.onError(error)).toBe('WAKU_CANCEL_RENDER');
  }
  expect(log).not.toHaveBeenCalled();
  expect(
    options.onError(Object.assign(new Error('boom'), { digest: 'arbitrary' })),
  ).toBeUndefined();
  expect(log).toHaveBeenCalledOnce();
});

test.each([false, true])(
  'build collects only application errors (application failure: %s)',
  async (fail) => {
    const applicationError = new Error('application error');
    mocks.render.mockImplementationOnce((_data, options) => {
      const { onError } = options as {
        onError: (error: unknown) => string | undefined;
      };
      try {
        cancelRender();
      } catch (error) {
        expect(onError(error)).toBe('WAKU_CANCEL_RENDER');
      }
      expect(
        onError(
          Object.assign(new Error('Flight error'), {
            digest: 'WAKU_CANCEL_RENDER',
          }),
        ),
      ).toBe('WAKU_CANCEL_RENDER');
      if (fail) {
        expect(onError(applicationError)).toBeUndefined();
      }
      return new ReadableStream({ start: (controller) => controller.close() });
    });
    const { processBuild } = runtime(
      async () => null,
      async ({ renderRsc }) => {
        await renderRsc({});
      },
    );
    const build = processBuild({
      emitFile: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });
    if (fail) {
      await expect(build).rejects.toMatchObject({
        name: 'AggregateError',
        errors: [applicationError],
      });
    } else {
      await expect(build).resolves.toBeUndefined();
    }
  },
);
