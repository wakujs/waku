import { createElement } from 'react';
import type { ReactNode } from 'react';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import { defineRouter } from '../src/router/define-router.js';
import { fsRouter } from '../src/router/fs-router.js';
import {
  ROUTE_ID,
  encodeRoutePath,
  encodeSliceId,
} from '../src/router/isomorphic-utils/router-protocol.js';

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

describe('define-router handleBuild', () => {
  it('maps router prefetch module ids through the shared id table', async () => {
    const scripts: string[] = [];
    const moduleIdsByRoute = new Map([
      ['/foo', ['shared-module', 'foo-module']],
      ['/bar', ['shared-module', 'bar-module']],
    ]);
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': { isStatic: true, renderer: () => null },
          },
        },
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'bar' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/bar': { isStatic: true, renderer: () => null },
          },
        },
      ],
    });

    type HandleBuildUtils = Parameters<typeof handleBuild>[0];
    const renderRsc: HandleBuildUtils['renderRsc'] = async (
      entries,
      options,
    ) => {
      const route = (entries as Record<string, unknown>)[ROUTE_ID];
      if (!Array.isArray(route) || typeof route[0] !== 'string') {
        throw new Error('route data was not rendered');
      }
      options?.unstable_clientModuleCallback?.(
        moduleIdsByRoute.get(route[0]) ?? [],
      );
      return makeStream();
    };
    const renderHtml: HandleBuildUtils['renderHtml'] = async (
      _elementsStream,
      _html,
      options,
    ) => {
      scripts.push(options.unstable_extraScriptContent ?? '');
      return new Response('<!doctype html>');
    };

    await handleBuild({
      renderRsc,
      renderHtml,
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    const script = scripts.find((content) => content.includes('bar-module'));
    if (!script) {
      throw new Error('router prefetch script was not rendered');
    }
    const sandbox: {
      __WAKU_ROUTER_PREFETCH__?: (
        path: string,
        callback: (id: string) => void,
      ) => void;
    } = {};
    runInNewContext(script, sandbox);

    const preloadedIds: string[] = [];
    sandbox.__WAKU_ROUTER_PREFETCH__?.('/bar', (id) => {
      preloadedIds.push(id);
    });

    expect(preloadedIds).toEqual(['shared-module', 'bar-module']);
  });

  it('caches static elements inside routes whose path is non-literal', async () => {
    const layoutRenderer = vi.fn(() => null);
    const pageRenderer = vi.fn(() => null);
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [
            { type: 'literal', name: 'nested' },
            { type: 'group', name: 'name' },
          ],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'layout:/nested': { isStatic: true, renderer: layoutRenderer },
            'page:/nested/[name]': {
              isStatic: false,
              renderer: pageRenderer,
            },
          },
        },
      ],
    });

    const saveBuildMetadata = vi.fn().mockResolvedValue(undefined);
    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    // Static elements inside a dynamic-path route should still be cached
    // at build time so the runtime can serve them without invoking the
    // renderer (which is essential for safely pruning their source files).
    expect(layoutRenderer).toHaveBeenCalled();
    const cached = saveBuildMetadata.mock.calls.find(
      ([key]) => key === 'defineRouter:cachedElements',
    );
    expect(cached, 'cachedElements should be saved').toBeDefined();
    const cachedEntries = JSON.parse(cached![1]);
    expect(Object.keys(cachedEntries)).toContain('slot/layout:/nested');
    // routeElement is keyed by the path template (not a concrete path)
    // so a single cache entry covers every concrete instance under
    // a slug/wildcard route.
    const templateRouteKey = `key/pathSpec/${JSON.stringify([
      { type: 'literal', name: 'nested' },
      { type: 'group', name: 'name' },
    ])}`;
    expect(Object.keys(cachedEntries)).toContain(templateRouteKey);
  });

  it('caches static slices reachable only from a dynamic-path route', async () => {
    // The standalone slice loop should still pre-build a static slice
    // even when the only routes referencing it are slug/wildcard
    // routes (which the per-route loop processes via
    // cacheStaticElementsOfRoute, not getEntriesForRoute).
    const sliceRenderer = vi.fn(async () => null);
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [
            { type: 'literal', name: 'nested' },
            { type: 'group', name: 'name' },
          ],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/nested/[name]': { isStatic: false, renderer: () => null },
          },
          slices: ['my-slice'],
        },
        {
          type: 'slice',
          id: 'my-slice',
          isStatic: true,
          renderer: sliceRenderer,
        },
      ],
    });

    const saveBuildMetadata = vi.fn().mockResolvedValue(undefined);
    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });

    expect(sliceRenderer).toHaveBeenCalled();
    const cached = saveBuildMetadata.mock.calls.find(
      ([key]) => key === 'defineRouter:cachedElements',
    );
    expect(cached).toBeDefined();
    expect(Object.keys(JSON.parse(cached![1]))).toContain(
      'slot/slice:my-slice',
    );
  });

  it('wraps EEXIST on static wildcard emit with a clear error', async () => {
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          pathSpec: [{ type: 'literal', name: 'test' }],
        },
        {
          type: 'api',
          handler: async () => Response.json('test'),
          isStatic: true,
          pathSpec: [
            { type: 'literal', name: 'test' },
            { type: 'literal', name: 'route' },
          ],
        },
      ],
    });

    const written = new Map<string, 'dir' | 'file'>();
    const generateFile = vi.fn(async (fileName: string) => {
      const segments = fileName.split('/').filter(Boolean);
      for (let i = 0; i < segments.length; i++) {
        const seg = segments.slice(0, i + 1).join('/');
        const type = i === segments.length - 1 ? 'file' : 'dir';
        if (written.has(seg) && written.get(seg) !== type) {
          const err = new Error('EEXIST');
          Object.assign(err, { code: 'EEXIST' });
          throw err;
        }
        written.set(seg, type);
      }
    });

    await expect(
      handleBuild({
        renderRsc: () => Promise.resolve(makeStream()),
        renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
        rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
        saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
        generateFile,
        generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
        unstable_registerPrunableFile: vi.fn(),
      }),
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(Error);
      const msg = (err as Error).message;
      expect(msg).toBe(
        'the API route /test/route faced file-system conflicts when writing static responses, this often happens because of empty segments in "staticPaths".',
      );
      return true;
    });
  });

  it('hydrates cached elements before any concurrent first request can read them', async () => {
    // Build phase: produce the build metadata.
    const buildSave = vi.fn().mockResolvedValue(undefined);
    const buildRouter = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': { isStatic: true, renderer: () => null },
          },
        },
      ],
    });
    await buildRouter.handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: buildSave,
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: vi.fn(),
    });
    const buildMetadata = new Map<string, string>(
      buildSave.mock.calls.map(([key, value]) => [key, value]),
    );

    // Runtime: empty getConfigs simulates a fully-pruned route, which only the
    // build output can serve, so any cache miss throws.
    const runtimeRouter = createConfiguredRouter({
      getConfigs: async () => [],
    });

    const loadBuildMetadata = vi.fn(async (key: string) => {
      // Slow down the cachedElements load so two concurrent first requests
      // both have a chance to enter the init block before it resolves.
      if (key === 'defineRouter:cachedElements') {
        await new Promise((r) => setTimeout(r, 30));
      }
      return buildMetadata.get(key);
    });

    const utils = {
      renderRsc: vi.fn().mockImplementation(async () => makeStream()),
      renderRscForParse: vi.fn().mockImplementation(async () => makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      loadBuildMetadata,
      renderHtmlFallback: vi.fn(),
    };
    const makeReq = () => ({
      type: 'rsc' as const,
      rscPath: 'R/foo',
      rscParams: undefined,
      pathname: '/foo',
      req: new Request('http://localhost/foo'),
    });

    const results = await Promise.allSettled([
      runtimeRouter.handleRequest(makeReq(), utils),
      runtimeRouter.handleRequest(makeReq(), utils),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        throw result.reason;
      }
    }
  });

  it('serves a static route from the build output once the router stops resolving it', async () => {
    const buildMetadata = new Map<string, string>();
    const buildRouter = defineRouter({
      resolve: async (pathname) =>
        pathname === '/foo'
          ? {
              elements: {
                root: { immutable: true, render: () => 'root' },
                route: { immutable: true, render: () => 'route' },
              },
            }
          : null,
      getBuildPaths: async () => ['/foo'],
    });
    await buildRouter.handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });

    const runtimeRouter = defineRouter({ resolve: async () => null });
    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    await runtimeRouter.handleRequest(
      {
        type: 'rsc',
        rscPath: 'R/foo',
        rscParams: undefined,
        pathname: '/RSC/R/foo.txt',
        req: new Request('http://localhost/RSC/R/foo.txt'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    expect(renderRsc.mock.calls[0]![0][ROUTE_ID]).toEqual(['/foo', '']);
  });

  it('leaves a path with prerender: false to the runtime resolve', async () => {
    const buildMetadata = new Map<string, string>();
    const resolve = vi.fn(async () => ({
      elements: {
        root: { immutable: true, render: () => 'root' },
        route: { render: () => 'dynamic' },
      },
    }));
    const router = defineRouter({
      resolve,
      getBuildPaths: async () => [
        {
          pathname: '/foo',
          routerDefinition: {
            elements: {
              root: { immutable: true, render: () => 'root' },
              route: { immutable: true, render: () => 'warm' },
            },
          },
          prerender: false,
        },
      ],
    });
    await router.handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn(),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });
    await router.handleRequest(
      {
        type: 'rsc',
        rscPath: 'R/foo',
        rscParams: undefined,
        pathname: '/RSC/R/foo.txt',
        req: new Request('http://localhost/RSC/R/foo.txt'),
      },
      {
        renderRsc: vi.fn().mockResolvedValue(makeStream()),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    expect(resolve).toHaveBeenCalledWith('/foo', '');
  });

  it('initializes once across concurrent first requests', async () => {
    const initialize = vi.fn(async () => {});
    const router = defineRouter({
      resolve: async () => null,
      initialize,
    });
    const utils = {
      renderRsc: vi.fn(),
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: async () => undefined,
    };
    const input = {
      type: 'rsc' as const,
      rscPath: 'R/foo',
      rscParams: undefined,
      pathname: '/RSC/R/foo.txt',
      req: new Request('http://localhost/RSC/R/foo.txt'),
    };
    await Promise.all([
      router.handleRequest(input, utils),
      router.handleRequest(input, utils),
    ]);

    expect(initialize).toHaveBeenCalledOnce();
  });

  it('does not register a source file shared by any dynamic config', async () => {
    // A source file that backs both a static and a dynamic config must stay
    // in the runtime bundle - pruning it would break the dynamic config.
    const register = vi.fn();
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'foo' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': {
              isStatic: true,
              renderer: () => null,
              sourceFile: 'pages/shared.tsx',
            },
          },
        },
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'bar' }],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/bar': {
              isStatic: false,
              renderer: () => null,
              sourceFile: 'pages/shared.tsx',
            },
          },
        },
      ],
    });

    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: register,
    });

    expect(register).not.toHaveBeenCalledWith('pages/shared.tsx');
  });

  it('registers a static page file only when its whole route is static', async () => {
    const register = vi.fn();
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'about' }],
          isStatic: true,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/about': {
              isStatic: true,
              renderer: () => null,
              sourceFile: 'pages/about.tsx',
            },
          },
        },
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'news' }],
          isStatic: false,
          rootElement: {
            isStatic: true,
            renderer: () => null,
            sourceFile: 'pages/_root.tsx',
          },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'layout:/': {
              isStatic: true,
              renderer: () => null,
              sourceFile: 'pages/_layout.tsx',
            },
            'layout:/news': {
              isStatic: false,
              renderer: () => null,
              sourceFile: 'pages/news/_layout.tsx',
            },
            'page:/news': {
              isStatic: true,
              renderer: () => null,
              sourceFile: 'pages/news.tsx',
            },
          },
        },
      ],
    });

    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn().mockResolvedValue(undefined),
      generateFile: vi.fn().mockResolvedValue(undefined),
      generateDefaultHtml: vi.fn().mockResolvedValue(undefined),
      unstable_registerPrunableFile: register,
    });

    // the build output cannot serve a static page whose layout is dynamic
    expect(register.mock.calls.flat().sort()).toEqual([
      'pages/_layout.tsx',
      'pages/_root.tsx',
      'pages/about.tsx',
    ]);
  });

  it('serves a pruned static route before a dynamic route that matches it', async () => {
    const About = () => createElement('p', null, 'about');
    const slugModule = async () => ({
      default: () => createElement('p', null, 'slug'),
      getConfig: async () => ({ render: 'dynamic' as const }),
    });
    const buildMetadata = new Map<string, string>();
    await fsRouter({
      './pages/about.tsx': async () => ({ default: About }),
      './pages/[slug].tsx': slugModule,
    }).handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    await fsRouter({
      './pages/about.tsx': async () => ({}),
      './pages/[slug].tsx': slugModule,
    }).handleRequest(
      {
        type: 'rsc',
        rscPath: 'R/about',
        rscParams: undefined,
        pathname: '/RSC/R/about.txt',
        req: new Request('http://localhost/RSC/R/about.txt'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    const slotIds = Object.keys(renderRsc.mock.calls[0]![0]);
    expect(slotIds).toContain('page:/about');
    expect(slotIds).not.toContain('page:/[slug]');
  });

  it('serves a built element before a broader runtime match', async () => {
    const buildMetadata = new Map<string, string>();
    await defineRouter({
      resolve: async () => null,
      getBuildElementIds: async () => [
        {
          id: 'slice:post/a',
          source: { immutable: true, render: () => 'post a' },
        },
      ],
    }).handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn(),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });

    // a dynamic `post/[id]` slice remains at runtime
    const resolveElement = vi.fn(async () => ({ render: () => 'dynamic' }));
    await defineRouter({
      resolve: async () => null,
      resolveElement,
    }).handleRequest(
      {
        type: 'rsc',
        rscPath: encodeSliceId('post/a'),
        rscParams: undefined,
        pathname: '/RSC/' + encodeSliceId('post/a') + '.txt',
        req: new Request('http://localhost/RSC/slice.txt'),
      },
      {
        renderRsc: vi.fn().mockResolvedValue(makeStream()),
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    expect(resolveElement).not.toHaveBeenCalled();
  });

  it('keeps pruned static layouts and slices in dynamic routes', async () => {
    const Layout = ({ children }: { children: ReactNode }) =>
      createElement('main', null, children);
    const Dynamic = () => createElement('p', null, 'dynamic');
    const dynamicModule = async () => ({
      default: Dynamic,
      getConfig: async () => ({
        render: 'dynamic' as const,
        slices: ['hello'],
      }),
    });
    const buildMetadata = new Map<string, string>();
    await fsRouter({
      './pages/_layout.tsx': async () => ({ default: Layout }),
      './pages/_slices/hello.tsx': async () => ({ default: () => 'hello' }),
      './pages/dynamic.tsx': dynamicModule,
    }).handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });

    // pruned modules are empty stubs at runtime
    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    await fsRouter({
      './pages/_layout.tsx': async () => ({}),
      './pages/_slices/hello.tsx': async () => ({}),
      './pages/dynamic.tsx': dynamicModule,
    }).handleRequest(
      {
        type: 'rsc',
        rscPath: 'R/dynamic',
        rscParams: undefined,
        pathname: '/RSC/R/dynamic.txt',
        req: new Request('http://localhost/RSC/R/dynamic.txt'),
      },
      {
        renderRsc,
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    expect(Object.keys(renderRsc.mock.calls[0]![0])).toEqual(
      expect.arrayContaining(['layout:/', 'slice:hello', 'page:/dynamic']),
    );
  });

  it('keeps a pruned static 404 route available at runtime', async () => {
    const buildMetadata = new Map<string, string>();
    const route404 = {
      type: 'route' as const,
      pathSpec: [{ type: 'literal' as const, name: '404' }],
      isStatic: true,
      rootElement: { isStatic: true, renderer: () => null },
      routeElement: { isStatic: true, renderer: () => null },
      elements: {},
    };
    await createConfiguredRouter({
      getConfigs: async () => [route404],
    }).handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: vi.fn(),
      generateDefaultHtml: vi.fn(),
      unstable_registerPrunableFile: vi.fn(),
    });

    const renderHtml = vi.fn().mockResolvedValue(new Response('not found'));
    await createConfiguredRouter({ getConfigs: async () => [] }).handleRequest(
      {
        type: 'http',
        pathname: '/missing',
        req: new Request('http://localhost/missing'),
      },
      {
        renderRsc: vi.fn().mockResolvedValue(makeStream()),
        renderHtml,
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      },
    );

    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it('emits files and metadata for static routes, apis, slices, 404, and noSsr', async () => {
    const generated = new Set<string>();
    const savedMetadata = new Map<string, string>();
    const generateDefaultHtml = vi.fn().mockResolvedValue(undefined);
    const staticRoute = (name: string, extra: object = {}) => ({
      type: 'route' as const,
      pathSpec: [{ type: 'literal' as const, name }],
      isStatic: true,
      rootElement: { isStatic: true, renderer: () => null },
      routeElement: { isStatic: true, renderer: () => null },
      elements: {},
      ...extra,
    });
    const { handleBuild } = createConfiguredRouter({
      getConfigs: async () => [
        staticRoute('foo'),
        staticRoute('404'),
        staticRoute('skipme'),
        staticRoute('nossr', { noSsr: true }),
        {
          type: 'api' as const,
          pathSpec: [{ type: 'literal' as const, name: 'data.txt' }],
          isStatic: true,
          handler: async () => new Response('api-body'),
        },
        {
          type: 'slice' as const,
          id: 'sb',
          isStatic: true,
          renderer: async () => 'SLICE',
        },
      ],
      unstable_skipBuild: (routePath) => routePath === '/skipme',
    });

    await handleBuild({
      renderRsc: () => Promise.resolve(makeStream()),
      renderHtml: vi.fn().mockResolvedValue(new Response('<!doctype html>')),
      rscPathToFileName: (rscPath: string) => `dist/${rscPath}.txt`,
      saveBuildMetadata: vi.fn(async (key: string, value: string) => {
        savedMetadata.set(key, value);
      }),
      generateFile: vi.fn(async (fileName: string) => {
        generated.add(fileName);
      }),
      generateDefaultHtml,
      unstable_registerPrunableFile: vi.fn(),
    });

    expect(generated.has(`dist/${encodeRoutePath('/foo')}.txt`)).toBe(true);
    expect(generated.has('/foo/index.html')).toBe(true);
    expect(generated.has('404.html')).toBe(true);
    expect([...generated].some((f) => f.includes('skipme'))).toBe(false);
    expect(generateDefaultHtml).toHaveBeenCalledExactlyOnceWith(
      '/nossr/index.html',
    );
    expect(generated.has('/data.txt')).toBe(true);
    expect(generated.has(`dist/${encodeSliceId('sb')}.txt`)).toBe(true);

    const cachedElements = JSON.parse(
      savedMetadata.get('defineRouter:cachedElements')!,
    ) as Record<string, string>;
    expect(Object.keys(cachedElements).length).toBeGreaterThan(0);
    expect(
      Object.keys(
        JSON.parse(
          savedMetadata.get('defineRouter:staticRouterDefinitionByRoutePath')!,
        ),
      ).sort(),
    ).toEqual(['/404', '/foo', '/nossr']);
    expect(
      JSON.parse(savedMetadata.get('defineRouter:staticElementIds')!),
    ).toEqual(['slice:sb']);
    expect(savedMetadata.has('defineRouter:moduleIdsByPrefetchRegExp')).toBe(
      true,
    );
  });
});
