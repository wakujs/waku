import { describe, expect, it, vi } from 'vitest';
import type { Unstable_RenderHtml } from '../src/lib/types.js';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import {
  ACTION_LOCATION_HEADER,
  INTENT_ID,
  IS_ORIGIN_ID,
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/router-protocol.js';
import {
  getRequest,
  unstable_rerenderRoute,
  unstable_setNonce,
} from '../src/router/server.js';

const intentPromise = expect.objectContaining({
  then: expect.any(Function),
});

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

const makeUtils = (loadBuildMetadata = vi.fn()) => ({
  renderRsc: vi.fn().mockImplementation(async () => makeStream()),
  parseRsc: vi.fn(),
  renderHtml: vi
    .fn<Unstable_RenderHtml>()
    .mockResolvedValue(new Response('ok')),
  loadBuildMetadata,
  renderHtmlFallback: vi.fn(async () => new Response('fallback')),
});

const rscInput = (rscPath: string, rscParams?: unknown) => ({
  type: 'rsc' as const,
  pathname: '/RSC/' + rscPath,
  rscPath,
  rscParams,
  req: new Request('http://localhost/RSC/' + rscPath),
});

const callInput = (fn: () => Promise<unknown>, actionLocation?: string) => ({
  type: 'call' as const,
  pathname: '/RSC/F/x.txt',
  fn,
  args: [],
  req: new Request('http://localhost/RSC/F/x.txt', {
    method: 'POST',
    ...(actionLocation
      ? { headers: { [ACTION_LOCATION_HEADER]: actionLocation } }
      : {}),
  }),
});

const dynamicRoute = (name: string) => ({
  type: 'route' as const,
  path: name === '/' ? [] : [{ type: 'literal' as const, name: name.slice(1) }],
  isStatic: false,
  rootElement: { isStatic: false, renderer: () => 'root' },
  routeElement: { isStatic: false, renderer: () => 'route' },
  elements: {},
});

describe('request dispatch', () => {
  it('returns null for an unknown rsc route', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/about')],
    });
    const res = await handleRequest(
      rscInput(encodeRoutePath('/missing')),
      makeUtils(),
    );
    expect(res).toBeNull();
  });

  it('serves a single-slice rsc request', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'slice' as const,
          id: 'sidebar',
          isStatic: false,
          renderer: async () => 'SIDEBAR',
        },
      ],
    });
    const utils = makeUtils();
    await handleRequest(rscInput(encodeSliceId('sidebar')), utils);
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ 'slice:sidebar': 'SIDEBAR' }),
      expect.anything(),
    );
  });

  it('merges entries scheduled by a server function rerender', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/');
        return 'fn-value';
      }),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/', ''] }),
      { value: 'fn-value', etags: {} },
    );
  });

  it('exposes the call request to a server function', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [],
    });
    let seen: Request | undefined;
    const input = callInput(async () => {
      seen = getRequest();
    });
    await handleRequest(input, makeUtils());
    expect(seen).toBe(input.req);
  });

  it('rerenders the route an action came from when asked with no arguments', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute();
        return 'fn-value';
      }, '/dest?a=1'),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        [ROUTE_ID]: ['/dest', 'a=1'],
        [IS_ORIGIN_ID]: true,
      }),
      { value: 'fn-value', etags: {} },
    );
  });

  it('renders a named route, not the one an action came from', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/'), dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/');
        return 'fn-value';
      }, '/dest'),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/', ''] }),
      { value: 'fn-value', etags: {} },
    );
    expect(utils.renderRsc.mock.calls[0]![0]).not.toHaveProperty(IS_ORIGIN_ID);
  });

  it('renders no slots for an action that does not ask, so an effect calling it cannot loop', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => 'fn-value', '/dest'),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      { [INTENT_ID]: intentPromise },
      { value: 'fn-value', etags: {} },
    );
  });

  it('rejects a no-argument rerender when the route an action came from is unknown', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    await expect(
      handleRequest(
        callInput(async () => {
          unstable_rerenderRoute();
        }),
        makeUtils(),
      ),
    ).rejects.toThrow('The route this action came from is unknown');
  });

  it('ignores a malformed action location unless the action asks for it', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => 'fn-value', '//['),
      utils,
    );
    expect(utils.renderRsc).toHaveBeenCalledWith(
      { [INTENT_ID]: intentPromise },
      { value: 'fn-value', etags: {} },
    );
  });

  it('types a no-argument rerender apart from a named one', () => {
    const assertTypes = (next: string | undefined) => {
      unstable_rerenderRoute();
      unstable_rerenderRoute('/dest', 'a=1');
      // @ts-expect-error an undefined path would mean the origin
      unstable_rerenderRoute(next, 'a=1');
    };
    expect(assertTypes).toBeTypeOf('function');
  });

  it('does not mark a response whose last rerender names a route', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/'), dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute();
        unstable_rerenderRoute('/dest');
        return 'fn-value';
      }, '/'),
      utils,
    );
    const [elements] = utils.renderRsc.mock.calls[0]!;
    expect(elements[ROUTE_ID]).toEqual(['/dest', '']);
    expect(elements).not.toHaveProperty(IS_ORIGIN_ID);
  });

  it('marks a response whose last rerender is the route an action came from', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/'), dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/dest');
        unstable_rerenderRoute();
        return 'fn-value';
      }, '/'),
      utils,
    );
    const [elements] = utils.renderRsc.mock.calls[0]!;
    expect(elements[ROUTE_ID]).toEqual(['/', '']);
    expect(elements[IS_ORIGIN_ID]).toBe(true);
  });

  it('rejects a no-argument rerender whose action location is malformed', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    await expect(
      handleRequest(
        callInput(async () => {
          unstable_rerenderRoute();
        }, '//['),
        makeUtils(),
      ),
    ).rejects.toThrow('The route this action came from is unknown');
  });

  it('does not mark a response after a no-argument rerender that failed', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/dest')],
    });
    const utils = makeUtils();
    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/dest');
        expect(() => unstable_rerenderRoute()).toThrow();
        return 'fn-value';
      }),
      utils,
    );
    const [elements] = utils.renderRsc.mock.calls[0]!;
    expect(elements[ROUTE_ID]).toEqual(['/dest', '']);
    expect(elements).not.toHaveProperty(IS_ORIGIN_ID);
  });

  it('maps api params and rewrites the request pathname', async () => {
    const apiHandler = vi.fn().mockResolvedValue(new Response('api'));
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'api' as const,
          path: [
            { type: 'literal' as const, name: 'api' },
            { type: 'group' as const, name: 'slug' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/api/hello',
        req: new Request('http://localhost/prefixed/api/hello?q=1'),
      },
      makeUtils(),
    );
    expect(res).toBeInstanceOf(Response);
    const [apiReq, apiContext] = apiHandler.mock.calls[0]!;
    expect(new URL(apiReq.url).pathname).toBe('/api/hello');
    expect(apiContext).toEqual({ params: { slug: 'hello' } });
  });

  it('answers an rsc request for a missing route with the 404 payload', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      rscInput(
        encodeRoutePath('/missing'),
        new URLSearchParams({ query: 'foo=bar' }),
      ),
      utils,
    );
    expect(res).not.toBeNull();
    expect(utils.renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/404', 'foo=bar'] }),
      expect.anything(),
    );
  });

  it('propagates a non-404 failure from a route render', async () => {
    const boom = {
      ...dynamicRoute('/boom'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          throw new Error('kaboom');
        },
      },
    };
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [boom, dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await expect(
      handleRequest(rscInput(encodeRoutePath('/boom')), utils),
    ).rejects.toThrow('kaboom');
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it('surfaces a broken 404 route instead of reporting no route', async () => {
    const broken = {
      ...dynamicRoute('/404'),
      routeElement: {
        isStatic: false,
        renderer: () => {
          throw new Error('the 404 page is broken');
        },
      },
    };
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [broken],
    });
    await expect(
      handleRequest(rscInput(encodeRoutePath('/missing')), makeUtils()),
    ).rejects.toThrow('the 404 page is broken');
  });

  it('renders the 404 route with the query that was asked for', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'http',
        pathname: '/nowhere',
        req: new Request('http://localhost/nowhere?foo=bar'),
      },
      utils,
    );
    // a client side 404 keeps the attempted query, so a direct load must too
    const elements = utils.renderRsc.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(elements?.ROUTE).toEqual(['/404', 'foo=bar']);
  });

  it('renders the 404 route for an unknown http page', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/404')],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/nowhere',
        req: new Request('http://localhost/nowhere'),
      },
      utils,
    );
    expect(res).toBeInstanceOf(Response);
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it('renders fallback HTML without rendering a noSsr route', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [{ ...dynamicRoute('/nossr'), noSsr: true }],
    });
    const utils = makeUtils();
    const res = await handleRequest(
      {
        type: 'http',
        pathname: '/nossr',
        req: new Request('http://localhost/nossr'),
      },
      utils,
    );
    expect(res).toBeInstanceOf(Response);
    expect(utils.renderHtmlFallback).toHaveBeenCalledOnce();
    expect(utils.renderRsc).not.toHaveBeenCalled();
    expect(utils.renderHtml).not.toHaveBeenCalled();
  });

  it('loads cached-elements and path2moduleIds metadata only once', async () => {
    const loadBuildMetadata = vi.fn(async (key: string) =>
      key === 'defineRouter:cachedElements' ? '{}' : undefined,
    );
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/')],
    });
    const request = () =>
      handleRequest(
        {
          type: 'http',
          pathname: '/',
          req: new Request('http://localhost/'),
        },
        makeUtils(loadBuildMetadata),
      );
    await request();
    await request();
    const countFor = (key: string) =>
      loadBuildMetadata.mock.calls.filter(([k]) => k === key).length;
    expect(countFor('defineRouter:cachedElements')).toBe(1);
    expect(countFor('defineRouter:path2moduleIds')).toBe(1);
  });

  it('exposes request-store APIs from router/server inside an interceptor', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [dynamicRoute('/')],
      unstable_interceptors: [
        async (next) => {
          unstable_setNonce(`n-${getRequest().headers.get('x-n') ?? ''}`);
          return next();
        },
      ],
    });
    const utils = makeUtils();
    await handleRequest(
      {
        type: 'http',
        pathname: '/',
        req: new Request('http://localhost/', {
          headers: { 'x-n': 'abc' },
        }),
      },
      utils,
    );
    expect(utils.renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ nonce: 'n-abc' }),
    );
  });
});
