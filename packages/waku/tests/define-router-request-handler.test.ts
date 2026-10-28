import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import type { RenderHtml } from '../src/lib/types.js';
import { unstable_isRenderCancellation as isRenderCancellation } from '../src/minimal/server.js';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import {
  ACTION_LOCATION_HEADER,
  INTENT_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/router-protocol.js';
import {
  createPages,
  getRequest,
  requestNotFound,
  requestRedirect,
  unstable_defineRouter,
  unstable_notFound,
  unstable_redirect,
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
  renderHtml: vi.fn<RenderHtml>().mockResolvedValue(new Response('ok')),
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
  pathSpec:
    name === '/' ? [] : [{ type: 'literal' as const, name: name.slice(1) }],
  isStatic: false,
  rootElement: { isStatic: false, renderer: () => 'root' },
  routeElement: { isStatic: false, renderer: () => 'route' },
  elements: {},
});

const staticRoute = (name: string) => ({
  ...dynamicRoute(name),
  isStatic: true,
  rootElement: { isStatic: true, renderer: () => 'root' },
  routeElement: { isStatic: true, renderer: () => 'route' },
});

describe('request dispatch', () => {
  it.each([
    {
      record: () => unstable_redirect('/login'),
      intent: { status: 307, location: '/login' },
    },
    { record: unstable_notFound, intent: { status: 404 } },
  ])(
    'retries a cancelled mutable slot and records its $intent on a revisit',
    async ({ record, intent }) => {
      const render = vi.fn(record);
      const router = unstable_defineRouter({
        resolve: async () => ({
          elements: {
            root: { render: () => 'root' },
            route: { getEtag: async () => 'gated-v1', render },
          },
        }),
        getHas404: async () => false,
      });
      const utils = makeUtils();
      const input = rscInput(encodeRoutePath('/gated'));
      await router.handleRequest(input, utils);
      const etags = utils.renderRsc.mock.calls[0]![1]?.etags;
      await router.handleRequest({ ...input, etags }, utils);

      expect(render).toHaveBeenCalledTimes(2);
      for (const [elements] of utils.renderRsc.mock.calls) {
        await expect(elements[INTENT_ID]).resolves.toBe(JSON.stringify(intent));
      }
    },
  );

  it.each([
    {
      record: () => requestRedirect('/login'),
      intent: { status: 307, location: '/login' },
    },
    { record: requestNotFound, intent: { status: 404 } },
  ])(
    'returns a $intent intent when a slice resolver returns null',
    async ({ record, intent }) => {
      const router = unstable_defineRouter({
        resolve: async () => null,
        resolveElement: async () => {
          record();
          return null;
        },
        getHas404: async () => false,
      });
      const utils = makeUtils();
      const response = await router.handleRequest(
        rscInput(encodeSliceId('guarded')),
        utils,
      );

      expect(response).toBeInstanceOf(ReadableStream);
      expect(utils.renderRsc).toHaveBeenCalledWith({
        [INTENT_ID]: intentPromise,
      });
      await expect(utils.renderRsc.mock.calls[0]![0][INTENT_ID]).resolves.toBe(
        JSON.stringify(intent),
      );
    },
  );

  it('returns null when a slice resolver returns no source or intent', async () => {
    const router = unstable_defineRouter({
      resolve: async () => null,
      resolveElement: async () => null,
      getHas404: async () => false,
    });
    const utils = makeUtils();

    expect(
      await router.handleRequest(rscInput(encodeSliceId('missing')), utils),
    ).toBeNull();
    expect(utils.renderRsc).not.toHaveBeenCalled();
  });

  it('falls back to HTTP 404 when its HTML render reports a decoded cancellation', async () => {
    const utils = makeUtils();
    utils.renderHtml.mockRejectedValue(
      Object.assign(new Error('cancelled'), { digest: 'WAKU_CANCEL_RENDER' }),
    );
    const router = unstable_defineRouter({
      resolve: async (pathname) => {
        if (pathname !== '/404') {
          unstable_notFound();
        }
        return {
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'not found' },
          },
        };
      },
      getHas404: async () => true,
    });
    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/account',
        req: new Request('http://localhost/account'),
      },
      utils,
    )) as Response;

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('<h1>Not Found</h1>');
    expect(utils.renderHtml).toHaveBeenCalledOnce();
  });

  it.each([
    { method: 'GET', fromSource: false },
    { method: 'GET', fromSource: true },
    { method: 'POST', fromSource: false },
    { method: 'POST', fromSource: true },
  ])(
    'honors a custom 404 redirect on $method (source: $fromSource)',
    async ({ method, fromSource }) => {
      const router = unstable_defineRouter({
        resolve: async (pathname) => {
          if (pathname !== '/404') {
            return null;
          }
          if (!fromSource) {
            unstable_redirect('/login');
          }
          return {
            elements: {
              root: { render: () => 'root' },
              route: { render: () => unstable_redirect('/login') },
            },
          };
        },
        getHas404: async () => true,
      });
      const utils = makeUtils();
      const tryAction = vi.fn();
      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/missing',
          req: new Request('http://localhost/base/missing', { method }),
          tryAction,
        },
        utils,
      )) as Response;
      expect(response.status).toBe(method === 'POST' ? 303 : 307);
      expect(response.headers.get('location')).toBe('/base/login');
      expect(tryAction).not.toHaveBeenCalled();
      expect(utils.renderHtml).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 303, record: () => unstable_redirect('/login'), has404: false },
    { status: 404, record: unstable_notFound, has404: false },
    { status: 404, record: unstable_notFound, has404: true },
  ])(
    'does not start a form action after a source requests $status (custom 404: $has404)',
    async ({ status, record, has404 }) => {
      const tryAction = vi.fn(async () => ({
        action: true as const,
        formState: null,
      }));
      const utils = makeUtils();
      utils.renderHtml.mockImplementation(
        async (_stream, _html, options) =>
          new Response('page', { status: options.status ?? 200 }),
      );
      const router = unstable_defineRouter({
        resolve: async (path) => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: path === '/404' ? () => 'not found' : record },
          },
        }),
        getHas404: async () => has404,
      });
      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account', { method: 'POST' }),
          tryAction,
        },
        utils,
      )) as Response;

      expect(response.status).toBe(status);
      expect(tryAction).not.toHaveBeenCalled();
    },
  );

  it('returns a redirect while cancellation of a cloned response remains pending', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const original = new Response(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
    );
    const clone = original.clone();
    const cancel = vi.spyOn(clone.body!, 'cancel');
    const utils = makeUtils();
    utils.renderHtml.mockImplementation(async () => {
      requestRedirect('/login');
      return clone;
    });
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          root: { render: () => 'root' },
          route: { render: () => 'page' },
        },
      }),
      getHas404: async () => false,
    });
    let response: Response | undefined;
    const pending = router
      .handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account'),
        },
        utils,
      )
      .then((value) => {
        response = value as Response;
      });
    try {
      await vi.waitFor(() => expect(response?.status).toBe(307));
      expect(response?.headers.get('location')).toBe('/login');
      expect(cancel).toHaveBeenCalledOnce();
      expect(cancel.mock.calls[0]![0]).toSatisfy(isRenderCancellation);
    } finally {
      controller.close();
      await original.body!.cancel();
      await pending;
    }
  });

  it('returns a render-time 404 even when discarding the original body rejects', async () => {
    const cancel = vi.fn(async () => {
      throw new Error('cleanup failed');
    });
    const utils = makeUtils();
    utils.renderHtml.mockImplementation(async () => {
      requestNotFound();
      return new Response(new ReadableStream({ cancel }));
    });
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          root: { render: () => 'root' },
          route: { render: () => 'page' },
        },
      }),
      getHas404: async () => false,
    });
    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/account',
        req: new Request('http://localhost/account'),
      },
      utils,
    )) as Response;

    expect(response.status).toBe(404);
    expect(await response.text()).toContain('<h1>Not Found</h1>');
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each(['GET', 'POST'])(
    'honors a redirect recorded before an interceptor awaits a document %s',
    async (method) => {
      const cancel = vi.fn();
      const utils = makeUtils();
      utils.renderHtml.mockResolvedValue(
        new Response(new ReadableStream({ cancel })),
      );
      const router = unstable_defineRouter({
        resolve: async () => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'page' },
          },
        }),
        getHas404: async () => false,
        unstable_interceptors: [
          async (next) => {
            requestRedirect('/login');
            return next();
          },
        ],
      });

      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/base/account', { method }),
        },
        utils,
      )) as Response;

      expect(response.status).toBe(method === 'POST' ? 303 : 307);
      expect(response.headers.get('location')).toBe('/base/login');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(cancel).not.toHaveBeenCalled();
      expect(utils.renderHtml).not.toHaveBeenCalled();
    },
  );

  it.each(['/account', '/404'])(
    'renders an interceptor 404 in its ALS context before the form action (%s)',
    async (pathname) => {
      const context = new AsyncLocalStorage<string>();
      const renderNotFound = vi.fn(() => context.getStore());
      const tryAction = vi.fn(async () => ({
        action: true as const,
        formState: null,
      }));
      const utils = makeUtils();
      utils.renderHtml.mockImplementationOnce(
        async (_stream, _html, { status }) =>
          new Response('custom 404', { status: status ?? 200 }),
      );
      const router = unstable_defineRouter({
        resolve: async (path) => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: path === '/404' ? renderNotFound : () => 'page' },
          },
        }),
        getHas404: async () => true,
        unstable_interceptors: [
          (next) =>
            context.run('tenant', async () => {
              requestNotFound();
              return next();
            }),
        ],
      });

      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname,
          req: new Request('http://localhost' + pathname + '?q=one', {
            method: 'POST',
          }),
          tryAction,
        },
        utils,
      )) as Response;

      expect(response.status).toBe(404);
      expect(await response.text()).toBe('custom 404');
      expect(renderNotFound).toHaveReturnedWith('tenant');
      expect(renderNotFound).toHaveBeenCalledOnce();
      expect(tryAction).not.toHaveBeenCalled();
      expect(utils.renderHtml.mock.calls[0]![2]).toMatchObject({
        status: 404,
        rscPath: encodeRoutePath('/404'),
        formState: undefined,
      });
      expect(utils.renderRsc.mock.calls[0]![0][ROUTE_ID]).toEqual([
        '/404',
        'q=one',
      ]);
      expect(context.getStore()).toBeUndefined();
    },
  );

  it('preserves interceptor headers on an already honored HTTP intent', async () => {
    const router = unstable_defineRouter({
      resolve: async () => null,
      getHas404: async () => false,
      unstable_interceptors: [
        async (next) => {
          requestRedirect('/login');
          const response = await next();
          if (response instanceof Response) {
            response.headers.set('set-cookie', 'session=active; HttpOnly');
          }
          return response;
        },
      ],
    });
    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/account',
        req: new Request('http://localhost/account'),
      },
      makeUtils(),
    )) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('/login');
    expect(response.headers.get('set-cookie')).toBe('session=active; HttpOnly');
  });

  it.each([
    {
      status: 307,
      record: () => requestRedirect('/dashboard'),
      location: '/dashboard',
      cacheControl: 'private, no-store',
      contentType: null,
    },
    {
      status: 404,
      record: requestNotFound,
      location: null,
      cacheControl: 'private, no-store',
      contentType: 'text/html; charset=utf-8',
    },
  ])(
    'lets interceptors add headers to a render-time $status response',
    async (expected) => {
      const cookies = [
        'session=active; HttpOnly; Path=/',
        'preferences=compact; Expires=Thu, 01 Jan 2037 00:00:00 GMT; Path=/',
      ];
      const cancel = vi.fn();
      const utils = makeUtils();
      utils.renderHtml
        .mockImplementationOnce(async () => {
          expected.record();
          return new Response(new ReadableStream({ cancel }), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
          });
        })
        .mockResolvedValueOnce(
          new Response('custom 404', {
            status: 404,
            headers: {
              'content-type': 'text/html; charset=utf-8',
            },
          }),
        );
      const router = unstable_defineRouter({
        resolve: async () => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'page' },
          },
        }),
        getHas404: async () => true,
        unstable_interceptors: [
          async (next) => {
            const response = await next();
            if (response instanceof Response) {
              for (const cookie of cookies) {
                response.headers.append('set-cookie', cookie);
              }
              response.headers.set(
                'content-security-policy',
                "default-src 'self'",
              );
            }
            return response;
          },
        ],
      });

      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account'),
        },
        utils,
      )) as Response;

      expect(response.status).toBe(expected.status);
      expect(response.headers.getSetCookie()).toEqual(cookies);
      expect(response.headers.get('content-security-policy')).toBe(
        "default-src 'self'",
      );
      expect(response.headers.get('cache-control')).toBe(expected.cacheControl);
      expect(response.headers.get('location')).toBe(expected.location);
      expect(response.headers.get('content-type')).toBe(expected.contentType);
      expect(cancel).toHaveBeenCalledOnce();
      expect(cancel.mock.calls[0]![0]).toSatisfy(isRenderCancellation);
    },
  );

  it.each([false, true])(
    'does not inherit a public cache policy when replacing a document with a 404 (custom page: %s)',
    async (has404) => {
      const utils = makeUtils();
      utils.renderHtml.mockImplementation(
        async (_stream, _html, { status }) => {
          const response = new Response('custom 404', {
            status: status ?? 200,
          });
          if (status !== 404) {
            response.headers.set('cache-control', 'public, max-age=600');
            requestNotFound();
          }
          return response;
        },
      );
      const router = unstable_defineRouter({
        resolve: async () => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'page' },
          },
        }),
        getHas404: async () => has404,
      });

      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account'),
        },
        utils,
      )) as Response;

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(await response.text()).toEqual(
        has404 ? 'custom 404' : expect.stringContaining('<h1>Not Found</h1>'),
      );
    },
  );

  it('preserves action form state when rendering the custom 404 before an interceptor returns', async () => {
    const formState = ['saved', 'form-key', 'actions#save', 0] as const;
    const tryAction = vi.fn(async () => {
      requestNotFound();
      return { action: true as const, formState };
    });
    const utils = makeUtils();
    utils.renderHtml.mockImplementation(
      async (_stream, _html, { status }) =>
        new Response('page', { status: status ?? 200 }),
    );
    const seenStatuses: number[] = [];
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          root: { render: () => 'root' },
          route: { render: () => 'page' },
        },
      }),
      getHas404: async () => true,
      unstable_interceptors: [
        async (next) => {
          const response = await next();
          if (response instanceof Response) {
            seenStatuses.push(response.status);
          }
          return response;
        },
      ],
    });

    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/account',
        req: new Request('http://localhost/account', { method: 'POST' }),
        tryAction,
      },
      utils,
    )) as Response;

    expect(response.status).toBe(404);
    expect(seenStatuses).toEqual([404]);
    expect(utils.renderHtml.mock.calls[0]![2].formState).toBe(formState);
    expect(tryAction).toHaveBeenCalledOnce();
    expect(utils.renderHtml).toHaveBeenCalledOnce();
  });

  it.each([
    { status: 307, record: requestNotFound },
    { status: 404, record: () => requestRedirect('/login') },
  ])(
    'returns the API handler response unchanged despite a recorded render intent ($status)',
    async ({ status, record }) => {
      const original = new Response('api body', {
        status,
        headers: {
          location: '/api-destination',
          'set-cookie': 'session=api; HttpOnly',
          'cache-control': 'private, max-age=30',
        },
      });
      const utils = makeUtils();
      const router = unstable_defineRouter({
        resolve: async () => async () => {
          record();
          return original;
        },
        getHas404: async () => true,
      });
      const response = await router.handleRequest(
        {
          type: 'http',
          pathname: '/api',
          req: new Request('http://localhost/api'),
        },
        utils,
      );

      expect(response).toBe(original);
      expect(await original.text()).toBe('api body');
      expect(original.status).toBe(status);
      expect(original.headers.get('location')).toBe('/api-destination');
      expect(original.headers.getSetCookie()).toEqual([
        'session=api; HttpOnly',
      ]);
      expect(original.headers.get('cache-control')).toBe('private, max-age=30');
      expect(utils.renderHtml).not.toHaveBeenCalled();
    },
  );

  it('renders a resolver not-found intent before starting an API handler', async () => {
    const api = vi.fn(async () => new Response('api body'));
    const utils = makeUtils();
    utils.renderHtml.mockImplementation(
      async (_stream, _html, { status }) =>
        new Response('custom 404', { status: status ?? 200 }),
    );
    const router = unstable_defineRouter({
      resolve: async (path) => {
        if (path === '/api') {
          requestNotFound();
          return api;
        }
        return {
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'custom 404' },
          },
        };
      },
      getHas404: async () => true,
    });
    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/api'),
      },
      utils,
    )) as Response;
    expect(response.status).toBe(404);
    expect(api).not.toHaveBeenCalled();
    expect(utils.renderHtml).toHaveBeenCalledOnce();
    expect(utils.renderRsc.mock.calls[0]![0]).toHaveProperty(
      'route:/404',
      'custom 404',
    );
  });

  it('propagates API cancellation without rendering its recorded intent', async () => {
    const utils = makeUtils();
    const router = unstable_defineRouter({
      resolve: async () => async () => unstable_redirect('/login'),
      getHas404: async () => true,
    });

    await expect(
      router.handleRequest(
        {
          type: 'http',
          pathname: '/api',
          req: new Request('http://localhost/api'),
        },
        utils,
      ),
    ).rejects.toSatisfy(isRenderCancellation);
    expect(utils.renderHtml).not.toHaveBeenCalled();
  });

  it.each([undefined, 'private, max-age=30'])(
    'defaults an early custom not-found intent to private caching (policy: %s)',
    async (cacheControl) => {
      const router = unstable_defineRouter({
        resolve: async (path) => {
          if (path !== '/404') {
            requestNotFound();
          }
          return {
            elements: {
              root: { render: () => 'root' },
              route: { render: () => path },
            },
          };
        },
        getHas404: async () => true,
      });
      const utils = makeUtils();
      utils.renderHtml.mockImplementation(
        async (_stream, _html, { status }) =>
          new Response('custom 404', {
            status: status ?? 200,
            headers: {
              'content-type': 'text/html',
              ...(cacheControl ? { 'cache-control': cacheControl } : {}),
            },
          }),
      );
      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account'),
        },
        utils,
      )) as Response;

      expect(response.status).toBe(404);
      expect(response.headers.get('cache-control')).toBe(
        cacheControl ?? 'private, no-store',
      );
    },
  );

  it('leaves a returned API response owned by its interceptor', async () => {
    const router = unstable_defineRouter({
      resolve: async (path) =>
        path === '/api'
          ? async () =>
              new Response('api output', {
                headers: { 'set-cookie': 'session=api; HttpOnly' },
              })
          : {
              elements: {
                root: { render: () => 'root' },
                route: { render: () => 'custom 404' },
              },
            },
      getHas404: async () => true,
      unstable_interceptors: [
        async (next) => {
          const response = await next();
          requestNotFound();
          return response;
        },
      ],
    });
    const utils = makeUtils();
    utils.renderHtml.mockImplementation(
      async (_stream, _html, { status }) =>
        new Response('custom 404', {
          status: status ?? 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    const response = (await router.handleRequest(
      {
        type: 'http',
        pathname: '/api',
        req: new Request('http://localhost/api'),
      },
      utils,
    )) as Response;

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(response.headers.get('cache-control')).toBeNull();
    expect(response.headers.getSetCookie()).toEqual(['session=api; HttpOnly']);
    expect(await response.text()).toBe('api output');
    expect(utils.renderHtml).not.toHaveBeenCalled();
  });

  it.each([requestNotFound, () => requestRedirect('/login')])(
    'leaves a returned document owned by its interceptor',
    async (record) => {
      const cancel = vi.fn();
      const original = new Response(new ReadableStream({ cancel }));
      const utils = makeUtils();
      utils.renderHtml.mockResolvedValue(original);
      const router = unstable_defineRouter({
        resolve: async () => ({
          elements: {
            root: { render: () => 'root' },
            route: { render: () => 'page' },
          },
        }),
        getHas404: async () => true,
        unstable_interceptors: [
          async (next) => {
            const result = await next();
            record();
            if (result instanceof Response) {
              result.headers.append('set-cookie', 'session=active');
            }
            return result;
          },
        ],
      });
      const response = (await router.handleRequest(
        {
          type: 'http',
          pathname: '/account',
          req: new Request('http://localhost/account'),
        },
        utils,
      )) as Response;
      expect(response).toBe(original);
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual(['session=active']);
      expect(cancel).not.toHaveBeenCalled();
    },
  );

  it('keeps static routes reusable when createPages registers an interceptor', async () => {
    const interceptor = vi.fn();
    const router = createPages(async ({ createPage, createInterceptor }) => {
      createInterceptor((next) => {
        interceptor();
        return next();
      });
      return [
        createPage({
          render: 'static',
          path: '/cached',
          component: () => null,
        }),
      ];
    });
    const utils = makeUtils();

    await router.handleRequest(rscInput(encodeRoutePath('/cached')), utils);

    expect(interceptor).toHaveBeenCalledOnce();
    expect(utils.renderRsc.mock.calls[0]![0][IS_STATIC_ID]).toBe(true);
  });

  it('does not cache an interceptor intent recorded before rendering', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [staticRoute('/cached')],
      unstable_interceptors: [
        async (next) => {
          requestRedirect('/login');
          return next();
        },
      ],
    });
    const utils = makeUtils();

    await handleRequest(rscInput(encodeRoutePath('/cached')), utils);

    const elements = utils.renderRsc.mock.calls[0]![0];
    expect(elements[IS_STATIC_ID]).toBe(false);
    await expect(elements[INTENT_ID]).resolves.toBe(
      JSON.stringify({ status: 307, location: '/login' }),
    );
  });

  it('does not cache a request intent recorded by resolve', async () => {
    const router = unstable_defineRouter({
      resolve: async () => {
        requestRedirect('/login');
        return {
          elements: {
            root: { immutable: true, render: () => null },
            route: { immutable: true, render: () => null },
          },
        };
      },
      getHas404: async () => false,
    });
    const utils = makeUtils();

    await router.handleRequest(rscInput(encodeRoutePath('/cached')), utils);

    expect(utils.renderRsc.mock.calls[0]![0][IS_STATIC_ID]).toBe(false);
  });

  it('runs scheduled renders after the server function finishes', async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let message = 'before';
    const render = vi.fn(() => message);
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          root: { render: () => 'root' },
          route: { render },
        },
      }),
      getHas404: async () => false,
    });
    const utils = makeUtils();
    const request = router.handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/saved');
        started.resolve();
        await release.promise;
        message = 'after';
        return 'saved';
      }),
      utils,
    );
    await started.promise;
    expect(render).not.toHaveBeenCalled();
    release.resolve();
    await request;
    expect(render).toHaveReturnedWith('after');
    expect(utils.renderRsc.mock.calls[0]![1]?.value).toBe('saved');
  });

  it('does not start scheduled renders when the server function fails', async () => {
    const render = vi.fn(() => {
      throw new Error('render failed');
    });
    const router = unstable_defineRouter({
      resolve: async () => ({
        elements: {
          root: { render: () => 'root' },
          route: { render },
        },
      }),
      getHas404: async () => false,
    });
    await expect(
      router.handleRequest(
        callInput(async () => {
          unstable_rerenderRoute('/unused');
          await new Promise((resolve) => setTimeout(resolve, 0));
          throw new Error('function failed');
        }),
        makeUtils(),
      ),
    ).rejects.toThrow('function failed');
    expect(render).not.toHaveBeenCalled();
  });

  it('merges multiple scheduled rerenders in declaration order', async () => {
    const router = unstable_defineRouter({
      resolve: async (path) => ({
        elements: {
          root: { render: () => path },
          route: { render: () => path },
        },
      }),
      getHas404: async () => false,
    });
    const utils = makeUtils();
    await router.handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/first');
        unstable_rerenderRoute('/second');
        return 'saved';
      }),
      utils,
    );
    expect(utils.renderRsc.mock.calls[0]![0]).toMatchObject({
      [ROUTE_ID]: ['/second', ''],
      root: '/second',
      'route:/first': '/first',
      'route:/second': '/second',
    });
  });

  it('skips a scheduled rerender when the server function records a redirect', async () => {
    const { handleRequest } = createConfiguredRouter({
      getConfigs: async () => [staticRoute('/cached')],
    });
    const utils = makeUtils();

    await handleRequest(
      callInput(async () => {
        unstable_rerenderRoute('/cached');
        await new Promise((resolve) => setTimeout(resolve, 0));
        requestRedirect('/login');
        return 'action-result';
      }),
      utils,
    );

    const [elements, options] = utils.renderRsc.mock.calls[0]!;
    expect(elements[ROUTE_ID]).toBeUndefined();
    await expect(elements[INTENT_ID]).resolves.toBe(
      JSON.stringify({ status: 307, location: '/login' }),
    );
    expect(options?.value).toBe('action-result');
  });

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

  it('rerenders the route a server function was called from when asked with no arguments', async () => {
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

  it('renders a named route, not the one a server function was called from', async () => {
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

  it('rejects a no-argument rerender when the route a server function was called from is unknown', async () => {
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
    ).rejects.toThrow(
      'The route this server function was called from is unknown',
    );
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

  it('marks a response whose last rerender is the route a server function was called from', async () => {
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
    ).rejects.toThrow(
      'The route this server function was called from is unknown',
    );
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
          pathSpec: [
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

  it('loads cached-elements and moduleIdsByPrefetchRegExp metadata only once', async () => {
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
    expect(countFor('defineRouter:moduleIdsByPrefetchRegExp')).toBe(1);
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
