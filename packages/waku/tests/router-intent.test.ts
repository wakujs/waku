import { describe, expect, it, vi } from 'vitest';
import { unstable_isRenderCancellation as isRenderCancellation } from '../src/minimal/server.js';
import { createElementCache } from '../src/router/define-router-utils/element-cache.js';
import {
  getRouteIntent,
  runWithRouterStore,
} from '../src/router/define-router-utils/request-store.js';
import {
  requestNotFound,
  requestRedirect,
  unstable_defineRouter,
  unstable_notFound,
  unstable_redirect,
} from '../src/router/server.js';

vi.mock('../src/server.js', () => ({
  serializeRsc: async (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)),
  deserializeRsc: async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
}));

const withinRequest = <T>(fn: () => T, signal?: AbortSignal) =>
  runWithRouterStore(
    { req: new Request('http://localhost/page', signal ? { signal } : {}) },
    fn,
  );

const expectPending = async (promise: PromiseLike<unknown>) => {
  const settled = vi.fn();
  void Promise.resolve(promise).then(settled, settled);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(settled).not.toHaveBeenCalled();
};

describe('intent metadata', () => {
  it('cancels an interceptor before resolution while preserving its redirect intent', async () => {
    const resolve = vi.fn(async () => null);
    const router = unstable_defineRouter({
      resolve,
      getHas404: async () => false,
      unstable_interceptors: [async () => unstable_redirect('/login')],
    });
    const utils = {
      renderRsc: vi.fn(
        async (_elements: Record<string, unknown>) => new ReadableStream(),
      ),
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    const document = await router.handleRequest(
      {
        type: 'http',
        pathname: '/private',
        req: new Request('http://localhost/base/private'),
      },
      utils,
    );
    expect((document as Response).status).toBe(307);
    expect((document as Response).headers.get('location')).toBe('/base/login');
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/private',
        rscPath: 'R/private',
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/private'),
      },
      utils,
    );
    const elements = utils.renderRsc.mock.calls[0]![0];
    expect(JSON.parse(await (elements.INTENT as Promise<string>))).toEqual({
      status: 307,
      location: '/login',
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('does not inherit the 404 probe cancellation on a normal page', async () => {
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path === '/404'
          ? unstable_notFound()
          : {
              elements: {
                root: { render: () => 'root' },
                route: { render: () => 'page' },
              },
            },
    });
    const renderRsc = vi.fn(async (elements) => {
      await expectPending(elements.INTENT);
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    });
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/page',
        rscPath: 'R/page',
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/page'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(renderRsc).toHaveBeenCalledOnce();
  });

  it.each([
    [unstable_notFound, { status: 404 }],
    [() => unstable_redirect('/next'), { status: 307, location: '/next' }],
  ])(
    'deprecated helpers record intent and stop execution with a generic cancellation',
    async (invoke, expected) => {
      await withinRequest(async () => {
        let cancellation: unknown;
        try {
          invoke();
          throw new Error('execution continued');
        } catch (error) {
          cancellation = error;
        }
        expect(isRenderCancellation(cancellation)).toBe(true);
        expect(typeof cancellation).toBe('symbol');
        expect(JSON.parse((await getRouteIntent().promise)!)).toEqual(expected);
      });
    },
  );

  it('transports a cancelled resolver redirect as intent without resolving its destination', async () => {
    const resolve = vi.fn(async () => unstable_redirect('/next?q=one'));
    const router = unstable_defineRouter({
      resolve,
      getHas404: async () => false,
    });
    const renderRsc = vi.fn(async (elements) => {
      expect(elements).toMatchObject({
        root: null,
        'route:/old': null,
        ROUTE: ['/old', ''],
        IS_STATIC: false,
      });
      expect(JSON.parse(await elements.INTENT)).toEqual({
        status: 307,
        location: '/next?q=one',
      });
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    });
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/old',
        rscPath: 'R/old',
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/old'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(resolve).toHaveBeenCalledOnce();
    expect(renderRsc).toHaveBeenCalledOnce();
  });

  it('keeps a cancelled resolver redirect as an HTTP response without JavaScript', async () => {
    const router = unstable_defineRouter({
      resolve: async () => unstable_redirect('/next'),
      getHas404: async () => false,
    });
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/old',
        req: new Request('http://localhost/old'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get('location')).toBe('/next');
  });

  it('replays an immutable factory intent after its render was cancelled', async () => {
    const saved = vi.fn();
    const cache = createElementCache(saved);
    await withinRequest(() =>
      cache.set('slot/cancelled', () => unstable_notFound()),
    );
    const restored = createElementCache();
    restored.preload(
      ...(saved.mock.calls[0] as [
        string,
        Parameters<typeof restored.preload>[1],
      ]),
    );
    await withinRequest(async () => {
      expect(await restored.get('slot/cancelled')).toBeNull();
      expect(getRouteIntent().value).toEqual({ status: 404 });
    });
  });

  it('encodes Unicode destinations and preserves existing escapes in HTTP headers', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        requestRedirect('/日本?q=café&escaped=%2F');
        return null;
      },
      getHas404: async () => false,
    });
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/unicode',
        req: new Request('http://localhost/base/unicode'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get('location')).toBe(
      '/base/%E6%97%A5%E6%9C%AC?q=caf%C3%A9&escaped=%2F',
    );
  });

  it('delivers a resolver intent even when no route elements are returned', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        requestRedirect('/destination');
        return null;
      },
      getHas404: async () => false,
    });
    const renderRsc = vi.fn(async (elements) => {
      expect(JSON.parse((await elements.INTENT)!)).toEqual({
        status: 307,
        location: '/destination',
      });
      return new ReadableStream({
        start(controller) {
          controller.close();
        },
      });
    });
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/resolve',
        rscPath: 'R/resolve',
        rscParams: undefined,
        req: new Request('http://localhost/RSC/R/resolve'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(renderRsc).toHaveBeenCalledOnce();
  });

  it('does not await an unused intent for an API response', async () => {
    let intent: ReturnType<typeof getRouteIntent> | undefined;
    const router = unstable_defineRouter({
      resolve: async () => async () => {
        intent = getRouteIntent();
        return new Response('api');
      },
      getHas404: async () => false,
    });
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/api'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    await expectPending(intent!.promise);
  });

  it('propagates metadata errors without awaiting an unused intent', async () => {
    let intent: ReturnType<typeof getRouteIntent> | undefined;
    const failure = new Error('metadata unavailable');
    const router = unstable_defineRouter({
      resolve: async () => null,
      unstable_interceptors: [
        async (next) => {
          intent = getRouteIntent();
          return next();
        },
      ],
    });
    await expect(
      router.handleRequest(
        {
          type: 'http',
          pathname: '/page',
          req: new Request('http://localhost/page'),
        },
        {
          renderRsc: vi.fn(),
          renderHtml: vi.fn(),
          renderHtmlFallback: vi.fn(),
          loadBuildMetadata: vi.fn().mockRejectedValue(failure),
        },
      ),
    ).rejects.toBe(failure);
    await expectPending(intent!.promise);
  });

  it('executes a no-JavaScript action once when notFound renders the 404 page', async () => {
    const route = {
      elements: {
        root: { immutable: false, render: () => 'root' },
        route: { immutable: false, render: () => 'page' },
      },
    };
    const router = unstable_defineRouter({
      resolve: async () => route,
      getHas404: async () => true,
    });
    const formState = { message: 'missing' };
    const tryAction = vi.fn(async () => {
      requestNotFound();
      return { action: true as const, formState };
    });
    const renderHtml = vi.fn(
      async (_stream, _html, options) =>
        new Response('page', { status: options.status }),
    );
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/posted',
        req: new Request('http://localhost/posted', { method: 'POST' }),
        tryAction,
      },
      {
        renderRsc: vi.fn(
          async () =>
            new ReadableStream({
              start(controller) {
                controller.close();
              },
            }),
        ),
        renderHtml,
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    expect(tryAction).toHaveBeenCalledOnce();
    expect((response as Response).status).toBe(404);
    expect(renderHtml.mock.calls.at(-1)![2]).toEqual(
      expect.objectContaining({ status: 404, formState }),
    );
  });

  it('honors a resolver notFound before a no-SSR fallback', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        requestNotFound();
        return {
          noSsr: true,
          elements: {
            root: { immutable: false, render: () => null },
            route: { immutable: false, render: () => null },
          },
        };
      },
      getHas404: async () => false,
    });
    const renderHtmlFallback = vi.fn();
    const response = await router.handleRequest(
      {
        type: 'http',
        pathname: '/client',
        req: new Request('http://localhost/client'),
      },
      {
        renderRsc: vi.fn(),
        renderHtml: vi.fn(),
        renderHtmlFallback,
        loadBuildMetadata: vi.fn(),
      },
    );
    expect((response as Response).status).toBe(404);
    expect((response as Response).headers.get('content-type')).toContain(
      'text/html',
    );
    expect(await (response as Response).text()).toContain('<h1>Not Found</h1>');
    expect(renderHtmlFallback).not.toHaveBeenCalled();
  });

  it('records navigation without throwing or consuming the normal return value', async () => {
    await withinRequest(async () => {
      const intent = getRouteIntent();
      const value = (() => {
        try {
          requestRedirect('/login');
        } catch {
          throw new Error('navigation was thrown');
        }
        return { saved: true };
      })();
      expect(value).toEqual({ saved: true });
      expect(JSON.parse((await intent.promise)!)).toEqual({
        status: 307,
        location: '/login',
      });
    });
  });

  it('ignores intents from an aborted request', async () => {
    const controller = new AbortController();
    await withinRequest(async () => {
      const intent = getRouteIntent();
      controller.abort();
      requestNotFound();
      await expectPending(intent.promise);
      expect(intent.value).toBeUndefined();
    }, controller.signal);
  });

  it('isolates concurrent requests and keeps the first intent per request', async () => {
    const gate = Promise.withResolvers<void>();
    const first = withinRequest(async () => {
      const intent = getRouteIntent();
      await gate.promise;
      requestRedirect('/first');
      requestNotFound();
      return intent.promise;
    });
    const second = withinRequest(async () => {
      const intent = getRouteIntent();
      requestNotFound();
      return intent.promise;
    });
    gate.resolve();
    expect(JSON.parse((await first)!)).toEqual({
      status: 307,
      location: '/first',
    });
    expect(JSON.parse((await second)!)).toEqual({ status: 404 });
  });

  it('persists a cached slot intent and replays it in a new request', async () => {
    const saved = vi.fn();
    const cache = createElementCache(saved);
    await withinRequest(async () => {
      await cache.set('slot/route', () => {
        requestRedirect('/cached');
        return 'cached element';
      });
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/cached',
      });
    });
    const [id, entry] = saved.mock.calls[0]!;
    expect(entry.intent).toEqual({ status: 307, location: '/cached' });
    const restored = createElementCache();
    restored.preload(id, entry);
    await withinRequest(async () => {
      expect(await restored.get(id)).toBe('cached element');
      expect(JSON.parse((await getRouteIntent().promise)!)).toEqual(
        entry.intent,
      );
    });
  });

  it('forwards a cached slot intent before the source finishes', async () => {
    const gate = Promise.withResolvers<void>();
    await withinRequest(async () => {
      const cache = createElementCache();
      const first = cache.set('first', async () => {
        requestRedirect('/first');
        await gate.promise;
        return 'first slot';
      });
      await cache.set('second', () => {
        requestRedirect('/second');
        return 'second slot';
      });
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/first',
      });
      gate.resolve();
      await first;
      await cache.get('first');
    });
  });

  it('does not forward callbacks from a completed cache capture', async () => {
    const gate = Promise.withResolvers<void>();
    const saved = vi.fn();
    const cache = createElementCache(saved);
    await withinRequest(async () => {
      let detached!: Promise<void>;
      await cache.set('slot', () => {
        detached = gate.promise.then(() => requestRedirect('/detached'));
        return 'cached element';
      });
      gate.resolve();
      await detached;
      expect(getRouteIntent().value).toBeUndefined();
      expect(saved.mock.calls[0]![1].intent).toBeUndefined();
      expect(await cache.get('slot')).toBe('cached element');
      expect(getRouteIntent().value).toBeUndefined();
    });
  });

  it('preserves a cached intent when its first requesting client aborts', async () => {
    const controller = new AbortController();
    const gate = Promise.withResolvers<void>();
    const cache = createElementCache(vi.fn());
    await withinRequest(async () => {
      const pending = cache.set('slot', async () => {
        await gate.promise;
        requestRedirect('/cached');
        return 'cached element';
      });
      controller.abort();
      gate.resolve();
      await pending;
      expect(getRouteIntent().value).toBeUndefined();
    }, controller.signal);
    await withinRequest(async () => {
      expect(await cache.get('slot')).toBe('cached element');
      expect(getRouteIntent().value).toEqual({
        status: 307,
        location: '/cached',
      });
    });
  });
});
