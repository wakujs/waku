/** @vitest-environment happy-dom */
import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchRsc } from '../src/minimal/client-utils/root-store.js';
import { getRouterCacheForTest } from '../src/router/client-core-utils/caches.js';
import {
  HAS404_ID,
  INTENT_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';

type Elements = Record<string, unknown>;

const { createFromReadableStream } = createRequire(import.meta.url)(
  'react-server-dom-webpack/client.edge',
) as {
  createFromReadableStream: (
    stream: ReadableStream,
    options: unknown,
  ) => Promise<Elements>;
};

const fetchRsc = vi.fn<FetchRsc>();
const cache = getRouterCacheForTest(fetchRsc);

type LoadOptions = Parameters<typeof cache.load>[1];

const route = (path: string, query = '', hash = '') => ({ path, query, hash });

const baseOpts = (
  overrides: Partial<LoadOptions> & { signal?: AbortSignal } = {},
): LoadOptions => ({
  signal: overrides.signal ?? new AbortController().signal,
  has404: false,
  refetch: true,
  base: {},
  url: new URL('http://localhost/next'),
  ...overrides,
});

describe('load', () => {
  beforeEach(() => {
    vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  });

  afterEach(() => {
    cache.clearCaches();
    fetchRsc.mockReset();
    vi.unstubAllEnvs();
  });

  it('returns a document redirect without fetching it or updating browser history', async () => {
    const href = window.location.href;
    fetchRsc.mockResolvedValue({
      [ROUTE_ID]: ['/next', ''],
      [INTENT_ID]: Promise.resolve(
        JSON.stringify({ status: 307, location: 'https://other.example/done' }),
      ),
    });
    const outcome = await cache.load(route('/next'), baseOpts());
    expect(outcome).toEqual({
      type: 'leave',
      url: new URL('http://localhost/next'),
      follows: 0,
      location: new URL('https://other.example/done'),
    });
    expect(fetchRsc).toHaveBeenCalledOnce();
    expect(window.location.href).toBe(href);
  });

  it('stops a ready self-redirect before fetching the route again', async () => {
    fetchRsc.mockResolvedValue({
      [ROUTE_ID]: ['/next', ''],
      [INTENT_ID]: Promise.resolve(
        JSON.stringify({ status: 307, location: '/next' }),
      ),
    });
    const outcome = await cache.load(
      route('/next'),
      baseOpts({ url: new URL('/next', window.location.href) }),
    );
    expect(outcome).toMatchObject({
      type: 'failed',
      error: { message: 'detected a navigation loop' },
    });
    expect(fetchRsc).toHaveBeenCalledOnce();
  });

  it.each([
    { from: '', to: '#comments' },
    { from: '#comments', to: '' },
  ])(
    'reuses the response for a fragment redirect from "$from" to "$to"',
    async ({ from, to }) => {
      const elements = {
        [ROUTE_ID]: ['/next', 'q=one'],
        [INTENT_ID]: Promise.resolve(
          JSON.stringify({ status: 307, location: `/next?q=one${to}` }),
        ),
      };
      fetchRsc.mockResolvedValue(elements);
      const outcome = await cache.load(
        route('/next', 'q=one', from),
        baseOpts({ url: new URL(`/next?q=one${from}`, window.location.href) }),
      );

      expect(outcome).toMatchObject({
        type: 'loaded',
        route: route('/next', 'q=one', to),
        url: new URL(`/next?q=one${to}`, window.location.href),
        elements,
        follows: 1,
      });
      expect(fetchRsc).toHaveBeenCalledOnce();
    },
  );

  it('does not reuse a rewritten response for a fragment redirect', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    fetchRsc
      .mockResolvedValueOnce({
        [ROUTE_ID]: ['/rewritten', ''],
        [INTENT_ID]: Promise.resolve(
          JSON.stringify({ status: 307, location: '/next#comments' }),
        ),
      })
      .mockResolvedValueOnce(elements);
    const outcome = await cache.load(
      route('/next'),
      baseOpts({ url: new URL('/next', window.location.href) }),
    );
    expect(outcome).toMatchObject({
      type: 'loaded',
      elements,
      route: route('/next', '', '#comments'),
    });
    expect(fetchRsc).toHaveBeenCalledTimes(2);
  });

  it('reuses static fragment redirects with a client-owned query', async () => {
    fetchRsc.mockResolvedValue({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
      [INTENT_ID]: Promise.resolve(
        JSON.stringify({ status: 307, location: '/next?q=one#comments' }),
      ),
    });
    const outcome = await cache.load(
      route('/next', 'q=one'),
      baseOpts({ url: new URL('/next?q=one', window.location.href) }),
    );
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/next', 'q=one', '#comments'),
    });
    expect(fetchRsc).toHaveBeenCalledOnce();
  });

  it('retains loop detection for an identical fragment redirect', async () => {
    fetchRsc.mockResolvedValue({
      [ROUTE_ID]: ['/next', ''],
      [INTENT_ID]: Promise.resolve(
        JSON.stringify({ status: 307, location: '/next#comments' }),
      ),
    });
    const outcome = await cache.load(
      route('/next', '', '#comments'),
      baseOpts({ url: new URL('/next#comments', window.location.href) }),
    );
    expect(outcome).toMatchObject({
      type: 'failed',
      error: { message: 'detected a navigation loop' },
    });
    expect(fetchRsc).toHaveBeenCalledOnce();
  });

  it('follows a ready intent decoded from Flight before returning the source route', async () => {
    const intent = JSON.stringify({
      status: 307,
      location: 'https://other.example/done',
    });
    const elements = await createFromReadableStream(
      new Response(
        '0:{"ROUTE":["/next",""],"INTENT":"$@1"}\n1:' +
          JSON.stringify(intent) +
          '\n',
      ).body!,
      {
        serverConsumerManifest: {
          moduleMap: {},
          serverModuleMap: {},
          moduleLoading: null,
        },
      },
    );
    fetchRsc.mockResolvedValue(elements);

    const outcome = await cache.load(route('/next'), baseOpts());

    expect(outcome).toMatchObject({
      type: 'leave',
      location: new URL('https://other.example/done'),
    });
    expect(fetchRsc).toHaveBeenCalledOnce();
  });

  it('loads a custom 404 that requests not-found without following it again', async () => {
    const elements = {
      [ROUTE_ID]: ['/404', ''],
      [HAS404_ID]: true,
      [INTENT_ID]: Promise.resolve(JSON.stringify({ status: 404 })),
    };
    fetchRsc.mockResolvedValue(elements);

    const outcome = await cache.load(route('/404'), baseOpts({ has404: true }));

    expect(outcome).toMatchObject({ type: 'loaded', elements });
    expect(fetchRsc).toHaveBeenCalledOnce();
  });

  it('does not reuse a static path when base lacks the route slot', async () => {
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    });
    const elements = { [ROUTE_ID]: ['/next', ''] };
    fetchRsc.mockResolvedValue(elements);
    const outcome = await cache.load(route('/next'), baseOpts());
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
    });
    expect(fetchRsc).toHaveBeenCalled();
  });

  it('reuses a static path when base already holds the route slot', async () => {
    cache.learnStaticFromElements({
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
    });
    const outcome = await cache.load(
      route('/next'),
      baseOpts({
        base: { [getRouteSlotId('/next')]: 'page' },
      }),
    );
    expect(outcome).toEqual({
      type: 'reused',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      follows: 0,
    });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('reuses when refetch is false', async () => {
    const outcome = await cache.load(
      route('/next'),
      baseOpts({ refetch: false }),
    );
    expect(outcome.type).toBe('reused');
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('fetches by encoded rscPath and returns the loaded attempt', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    fetchRsc.mockResolvedValue(elements);
    const outcome = await cache.load(route('/next'), baseOpts());
    expect(fetchRsc).toHaveBeenCalledWith(
      encodeRoutePath('/next'),
      expect.any(URLSearchParams),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        unstable_base: {},
      }),
    );
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
    });
  });

  it('omits onBuildIdMismatch so fetchRsc keeps the reload default', async () => {
    fetchRsc.mockResolvedValue({ [ROUTE_ID]: ['/next', ''] });
    await cache.load(route('/next'), baseOpts());
    const options = fetchRsc.mock.calls[0]?.[2];
    expect(options && 'onBuildIdMismatch' in options).toBe(false);
  });

  it('forwards onBuildIdMismatch when the caller supplied one', async () => {
    const onBuildIdMismatch = vi.fn();
    fetchRsc.mockResolvedValue({ [ROUTE_ID]: ['/next', ''] });
    await cache.load(route('/next'), baseOpts({ onBuildIdMismatch }));
    const options = fetchRsc.mock.calls[0]?.[2];
    expect(options).toEqual(
      expect.objectContaining({
        onBuildIdMismatch: expect.any(Function),
      }),
    );
    options?.onBuildIdMismatch?.();
    expect(onBuildIdMismatch).toHaveBeenCalledWith(
      new URL('http://localhost/next'),
    );
  });

  it('uses an in-flight prefetch instead of fetching again', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    let resolveFetch!: (value: Elements) => void;
    fetchRsc.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    cache.prefetchRoute(route('/next'));
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    const pending = cache.load(route('/next'), baseOpts());
    expect(fetchRsc).toHaveBeenCalledTimes(1);
    resolveFetch(elements);
    await expect(pending).resolves.toMatchObject({
      type: 'loaded',
      elements,
    });
  });

  it('notifies onInvalidate when a prefetch is dropped', async () => {
    const onInvalidate = vi.fn();
    const controller = new AbortController();
    let invalidate!: () => void;
    fetchRsc.mockImplementationOnce((_path, _params, options) => {
      invalidate = () =>
        (
          options as { onBuildIdMismatch?: () => void } | undefined
        )?.onBuildIdMismatch?.();
      return new Promise(() => {});
    });
    cache.prefetchRoute(route('/next'));
    const pending = cache.load(
      route('/next'),
      baseOpts({ onInvalidate, signal: controller.signal }),
    );
    invalidate();
    expect(onInvalidate).toHaveBeenCalledWith(new URL('http://localhost/next'));
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
  });

  it('notifies the remaining load when a second adopter of the same prefetch aborts', async () => {
    const onInvalidateA = vi.fn();
    const onInvalidateB = vi.fn();
    const controllerA = new AbortController();
    const controllerB = new AbortController();
    let invalidate!: () => void;
    fetchRsc.mockImplementationOnce((_path, _params, options) => {
      invalidate = () =>
        (
          options as { onBuildIdMismatch?: () => void } | undefined
        )?.onBuildIdMismatch?.();
      return new Promise(() => {});
    });
    cache.prefetchRoute(route('/next'));
    const pendingA = cache.load(
      route('/next'),
      baseOpts({ onInvalidate: onInvalidateA, signal: controllerA.signal }),
    );
    const pendingB = cache.load(
      route('/next'),
      baseOpts({ onInvalidate: onInvalidateB, signal: controllerB.signal }),
    );
    controllerB.abort();
    await expect(pendingB).resolves.toEqual({ type: 'aborted' });
    invalidate();
    expect(onInvalidateA).toHaveBeenCalledWith(
      new URL('http://localhost/next'),
    );
    expect(onInvalidateB).not.toHaveBeenCalled();
    controllerA.abort();
    await expect(pendingA).resolves.toEqual({ type: 'aborted' });
  });

  it('returns aborted when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const outcome = await cache.load(
      route('/next'),
      baseOpts({ signal: controller.signal }),
    );
    expect(outcome).toEqual({ type: 'aborted' });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('returns aborted when the fetch is cancelled', async () => {
    const controller = new AbortController();
    fetchRsc.mockImplementation(
      (_path, _params, options) =>
        new Promise((_, reject) => {
          options?.signal?.addEventListener('abort', () =>
            reject(options.signal!.reason),
          );
        }),
    );
    const pending = cache.load(
      route('/next'),
      baseOpts({ signal: controller.signal }),
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
  });

  it('fails on a non-followable error', async () => {
    const error = new Error('boom');
    fetchRsc.mockRejectedValue(error);
    const outcome = await cache.load(route('/next'), baseOpts());
    expect(outcome).toEqual({
      type: 'failed',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      error,
      follows: 0,
    });
  });

  it('adopts the given promise on the first attempt and does not fetch', async () => {
    const elements = { [ROUTE_ID]: ['/next', ''] };
    const outcome = await cache.load(
      route('/next'),
      baseOpts({ adopt: Promise.resolve(elements) }),
    );
    expect(fetchRsc).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      type: 'loaded',
      route: route('/next'),
      url: new URL('http://localhost/next'),
      elements,
      follows: 0,
    });
  });

  it('adopts fresh elements even when the route is reusable from cache', async () => {
    const base = {
      [ROUTE_ID]: ['/next', ''],
      [IS_STATIC_ID]: true,
      [getRouteSlotId('/next')]: 'cached',
    };
    cache.learnStaticFromElements(base);
    const elements = { ...base, [getRouteSlotId('/next')]: 'updated' };

    const outcome = await cache.load(
      route('/next'),
      baseOpts({ base, adopt: Promise.resolve(elements) }),
    );

    expect(outcome).toMatchObject({ type: 'loaded', elements });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('an aborted adopt is aborted, not failed', async () => {
    const controller = new AbortController();
    const adopt = new Promise<Elements>(() => {});
    const pending = cache.load(
      route('/next'),
      baseOpts({ adopt, signal: controller.signal }),
    );
    controller.abort();
    await expect(pending).resolves.toEqual({ type: 'aborted' });
    expect(fetchRsc).not.toHaveBeenCalled();
  });

  it('loaded.route is the requested attempt, not the response ROUTE_ID', async () => {
    fetchRsc.mockResolvedValue({ [ROUTE_ID]: ['/other', ''] });
    const outcome = await cache.load(route('/next'), baseOpts());
    expect(outcome).toMatchObject({
      type: 'loaded',
      route: route('/next'),
    });
  });
});
