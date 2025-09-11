import { expect, vi, describe, it, beforeEach, assert } from 'vitest';
import type { MockedFunction } from 'vitest';
import {
  createPages,
  pathMappingWithoutGroups,
} from '../src/router/create-pages.js';
import type {
  CreateApi,
  CreateLayout,
  CreatePage,
  CreateSlice,
  HasSlugInPath,
  HasWildcardInPath,
  IsValidPathInSlugPath,
  PathWithoutSlug,
  PathWithSlug,
  PathWithWildcard,
  StaticSlugRoutePathsTuple,
} from '../src/router/create-pages.js';
import { unstable_defineRouter } from '../src/router/define-router.js';
import type { PropsWithChildren } from 'react';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import type { PathsForPages } from '../src/router/base-types.js';
import type { GetSlugs } from '../src/router/create-pages-utils/inferred-path-types.js';
import { parsePathWithSlug } from '../src/lib/utils/path.js';

function Fake() {
  return null;
}
const complexTestRouter = (fn: typeof createPages, component = Fake) => {
  return fn(async ({ createPage }) => {
    // Dynamic pages
    const dynamicNoSlug = createPage({
      render: 'dynamic',
      path: '/client/dynamic',
      component,
    });
    const dynamicOneSlugPage = createPage({
      render: 'dynamic',
      path: '/server/one/[echo]',
      component,
    });
    const dynamicTwoSlugPage = createPage({
      render: 'dynamic',
      path: '/server/two/[echo]/[echo2]',
      component,
    });
    const dynamicWildcardPage = createPage({
      render: 'dynamic',
      path: '/server/wild/[...wild]',
      component,
    });
    const dynamicSlugAndWildcardPage = createPage({
      render: 'dynamic',
      path: '/server/oneAndWild/[slug]/[...wild]',
      component,
    });

    // Static pages
    const staticNoSlug = createPage({
      render: 'static',
      path: '/client/static',
      component,
    });
    const staticOneSlugPage = createPage({
      render: 'static',
      path: '/server/static/[echo]',
      staticPaths: ['static-echo', 'static-echo-2'] as const,
      component,
    });
    const staticTwoSlugPage = createPage({
      render: 'static',
      path: '/server/static/[echo]/[echo2]',
      staticPaths: [
        ['static-echo', 'static-echo-2'],
        ['hello', 'hello-2'],
      ] as const,
      component,
    });
    const staticWildcardPage = createPage({
      render: 'static',
      path: '/static/wild/[...wild]',
      staticPaths: [
        ['bar'],
        ['hello', 'hello-2'],
        ['foo', 'foo-2', 'foo-3'],
      ] as const,
      component,
    });

    return [
      dynamicNoSlug,
      dynamicOneSlugPage,
      dynamicTwoSlugPage,
      dynamicWildcardPage,
      dynamicSlugAndWildcardPage,

      staticNoSlug,
      staticOneSlugPage,
      staticTwoSlugPage,
      staticWildcardPage,
    ];
  });
};

describe('type tests', () => {
  it('PathWithoutSlug', () => {
    expectType<PathWithoutSlug<'/test'>>('/test');
    expectType<PathWithoutSlug<'/test/a'>>('/test/a');
    // @ts-expect-error: PathWithoutSlug does not allow slugs - surprise!
    expectType<PathWithoutSlug<'/test/[slug]'>>('/test/[slug]');
  });
  it('PathWithSlug', () => {
    expectType<PathWithSlug<'/test/[slug]', 'slug'>>('/test/[slug]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'a'>>('/test/[a]/[b]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'b'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the path does not match.
    expectType<PathWithSlug<'/test/[a]', 'a'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the slug-id is not in the path.
    expectType<PathWithSlug<'/test/[a]/[b]', 'c'>>('/test/[a]/[b]');
  });
  it('PathWithWildcard', () => {
    expectType<PathWithWildcard<'/test/[...path]', never, 'path'>>(
      '/test/[...path]',
    );
    expectType<PathWithWildcard<'/test/[slug]/[...path]', 'slug', 'path'>>(
      '/test/[slug]/[...path]',
    );
    expectType<PathWithWildcard<'/test/[slug]/[...path]', 'slug', 'path'>>(
      // @ts-expect-error: PathWithWildcard fails if the path does not match.
      '/test/[a]/[...path]',
    );
  });
  it('HasSlugInPath', () => {
    expectType<HasSlugInPath<'/test/[a]/[b]', 'a'>>(true);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'b'>>(true);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'c'>>(false);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'd'>>(false);
  });
  it('IsValidPathInSlugPath', () => {
    expectType<IsValidPathInSlugPath<'/test/[a]/[b]'>>(true);
    expectType<IsValidPathInSlugPath<'/test/[a]/[b]'>>(true);
    expectType<IsValidPathInSlugPath<'/test'>>(true);

    expectType<IsValidPathInSlugPath<'foobar'>>(false);
    expectType<IsValidPathInSlugPath<'/'>>(false);
  });
  it('HasWildcardInPath', () => {
    expectType<HasWildcardInPath<'/test/[...path]'>>(true);
    expectType<HasWildcardInPath<'/test/[a]/[...path]'>>(true);
    expectType<HasWildcardInPath<'/test/[a]/[b]/[...path]'>>(true);

    expectType<HasWildcardInPath<'/test/[a]/[b]'>>(false);
    expectType<HasWildcardInPath<'/test'>>(false);
    expectType<HasWildcardInPath<'/'>>(false);
  });
  it('GetSlugs', () => {
    expectType<GetSlugs<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<GetSlugs<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<GetSlugs<'/test/[a]/[b]/[c]'>>(['a', 'b', 'c']);
    expectType<GetSlugs<'/test/[a]/[b]/[c]/[d]'>>(['a', 'b', 'c', 'd']);
  });
  it('StaticSlugRoutePathsTuple', () => {
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]/[c]'>>([
      'foo',
      'bar',
      'buzz',
    ]);
    // @ts-expect-error: Too many slugs
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]/[c]'>>([
      'foo',
      'bar',
      'buzz',
      'baz',
    ]);
  });

  describe('createPage', () => {
    it('static', () => {
      const createPage: CreatePage = vi.fn();
      // @ts-expect-error: render is not valid
      createPage({ render: 'foo' });
      // @ts-expect-error: path is required
      createPage({ render: 'static' });
      // @ts-expect-error: path is invalid
      createPage({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createPage({ render: 'static', path: '/' });
      // @ts-expect-error: component is not a function
      createPage({ render: 'static', path: '/', component: 123 });
      // @ts-expect-error: missing static paths
      createPage({ render: 'static', path: '/[a]', component: () => 'Hello' });

      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        // @ts-expect-error: static paths do not match the slug pattern
        staticPaths: ['c'],
        component: () => 'Hello',
      });

      // good
      createPage({
        render: 'static',
        path: '/test/[a]',
        staticPaths: ['x', 'y', 'z'],
        component: () => 'Hello',
      });
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        staticPaths: [
          ['a', 'b'],
          ['c', 'd'],
        ],
        component: () => 'Hello',
      });
      createPage({
        render: 'static',
        path: '/test/[...wild]',
        staticPaths: ['c', 'd', 'e'],
        component: () => 'Hello',
      });
    });
    it('dynamic', () => {
      const createPage: CreatePage = vi.fn();
      // @ts-expect-error: render is not valid
      createPage({ render: 'foo' });
      // @ts-expect-error: path is required
      createPage({ render: 'dynamic' });
      // @ts-expect-error: path is invalid
      createPage({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createPage({ render: 'dynamic', path: '/' });
      // @ts-expect-error: component is not a function
      createPage({ render: 'dynamic', path: '/', component: 123 });

      // good
      createPage({ render: 'dynamic', path: '/[a]', component: () => 'Hello' });
    });
  });
  describe('createLayout', () => {
    it('static', () => {
      const createLayout: CreateLayout = vi.fn();
      // @ts-expect-error: render is not valid
      createLayout({ render: 'foo' });
      // @ts-expect-error: path is invalid
      createLayout({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createLayout({ render: 'static' });
      // @ts-expect-error: component is not a function
      createLayout({ render: 'static', component: 123 });

      // good
      createLayout({ render: 'static', path: '/', component: () => 'Hello' });
    });
    it('dynamic', () => {
      const createLayout: CreateLayout = vi.fn();
      // @ts-expect-error: path is invalid
      createLayout({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createLayout({ render: 'dynamic' });
      // @ts-expect-error: component is not a function
      createLayout({ render: 'static', component: 123 });

      // good
      createLayout({ render: 'dynamic', path: '/', component: () => 'Hello' });
    });
  });
  describe('createSlice', () => {
    it('static', () => {
      const createSlice: CreateSlice = vi.fn();
      // @ts-expect-error: render is not valid
      createSlice({ render: 'foo' });
      // @ts-expect-error: path is invalid
      createSlice({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createSlice({ render: 'static' });
      // @ts-expect-error: component is not a function
      createSlice({ render: 'static', component: 123 });
      // @ts-expect-error: id is missing
      createSlice({ render: 'static', paths: ['/'] });
      // @ts-expect-error: id is not a string
      createSlice({ render: 'static', paths: ['/'], id: 123 });
      // good
      createSlice({ render: 'static', component: () => null, id: 'slice001' });
    });
    it('dynamic', () => {
      const createSlice: CreateSlice = vi.fn();
      // @ts-expect-error: path is invalid
      createSlice({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createSlice({ render: 'dynamic' });
      // @ts-expect-error: component is not a function
      createSlice({ render: 'static', component: 123 });
      // @ts-expect-error: id is missing
      createSlice({ render: 'static', paths: ['/'] });
      // @ts-expect-error: id is not a string
      createSlice({ render: 'static', paths: ['/'], id: 123 });
      // good
      createSlice({ render: 'static', component: () => null, id: 'slice001' });
    });
  });

  describe('createApi', () => {
    it('static', () => {
      const createApi: CreateApi = vi.fn();
      createApi({
        path: '/',
        // @ts-expect-error: render is not valid
        render: 'foo',
        method: 'GET',
        // @ts-expect-error: null is not valid Response
        handler: () => null,
      });
      createApi({
        path: '/',
        render: 'static',
        // @ts-expect-error: method is not valid
        method: 'foo',
        // @ts-expect-error: null is not valid
        handler: () => null,
      });
      // @ts-expect-error: handler is not valid
      createApi({ path: '/', render: 'static', method: 'GET', handler: 123 });

      // good
      createApi({
        path: '/',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      });
    });
    it('dynamic', () => {
      const createApi: CreateApi = vi.fn();
      createApi({
        path: '/',
        // @ts-expect-error: render not valid
        render: 'foo',
        method: 'GET',
        // @ts-expect-error: handler not valid
        handler: () => null,
      });
      createApi({
        path: '/foo',
        render: 'dynamic',
        handlers: {
          // @ts-expect-error: null is not valid
          GET: () => null,
        },
      });
      // @ts-expect-error: handler is not valid
      createApi({ path: '/', render: 'dynamic', method: 'GET', handler: 123 });

      // good
      createApi({
        path: '/foo/[slug]',
        render: 'dynamic',
        handlers: {
          POST: async (req) => {
            return new Response('Hello World ' + new URL(req.url).pathname);
          },
        },
      });
    });
  });

  describe('createPages', () => {
    it('empty', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // @ts-expect-error: null is not a valid return type
      mockedCreatePages(async () => null);

      // @ts-expect-error: page result is not returned
      const _emptyRouterDynamic = mockedCreatePages(async ({ createPage }) => {
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' });
      });

      // @ts-expect-error: page result is not returned
      const _emptyRouterStatic = mockedCreatePages(async ({ createPage }) => {
        createPage({ render: 'static', path: '/', component: () => 'Hello' });
      });

      // good and empty
      const _emptyRouter = mockedCreatePages(async () => []);
      expectType<TypeEqual<PathsForPages<typeof _emptyRouter>, string>>(true);
    });

    it('static', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and single page
      const _singlePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'static', path: '/', component: () => 'Hello' }),
      ]);
      expectType<TypeEqual<PathsForPages<typeof _singlePageRouter>, '/'>>(true);

      // good with multiple pages
      const _multiplePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'static', path: '/', component: () => 'Hello' }),
        createPage({ render: 'static', path: '/foo', component: () => 'Foo' }),
        createPage({
          render: 'static',
          path: '/bar/[slug]',
          staticPaths: ['a', 'b'] as const,
          component: () => 'Bar',
        }),
        createPage({
          render: 'static',
          path: '/buzz/[...slug]',
          staticPaths: [['a'], ['b', 'c'], ['hello', 'world']] as const,
          component: () => 'Bar',
        }),
      ]);
      expectType<
        TypeEqual<
          PathsForPages<typeof _multiplePageRouter>,
          | '/'
          | '/foo'
          | '/bar/a'
          | '/bar/b'
          | '/buzz/a'
          | '/buzz/b/c'
          | '/buzz/hello/world'
        >
      >(true);
    });

    it('dynamic', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and single page
      const _singlePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
      ]);
      expectType<TypeEqual<PathsForPages<typeof _singlePageRouter>, '/'>>(true);

      // good with multiple pages
      const _multiplePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
        createPage({ render: 'dynamic', path: '/foo', component: () => 'Foo' }),
        createPage({
          render: 'dynamic',
          path: '/bar/[slug]',
          component: () => 'Bar',
        }),
        createPage({
          render: 'dynamic',
          path: '/buzz/thing/[...slug]',
          component: () => 'Bar',
        }),
      ]);
      expectType<
        TypeEqual<
          PathsForPages<typeof _multiplePageRouter>,
          '/' | '/foo' | `/bar/${string}` | `/buzz/thing/${string}`
        >
      >(true);
    });

    it('static + dynamic mixed', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and simple
      const _simpleRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
        createPage({
          render: 'static',
          path: '/about',
          component: () => 'about me',
        }),
      ]);
      expectType<
        TypeEqual<PathsForPages<typeof _simpleRouter>, '/' | '/about'>
      >(true);

      // good and complex
      const _complexRouter = complexTestRouter(mockedCreatePages);
      expectType<
        TypeEqual<
          PathsForPages<typeof _complexRouter>,
          | '/client/dynamic'
          | '/client/static'
          | `/server/one/${string}`
          | `/server/two/${string}/${string}`
          | `/server/wild/${string}`
          | `/server/oneAndWild/${string}/${string}`
          | '/server/static/static-echo'
          | '/server/static/static-echo-2'
          | '/server/static/static-echo/static-echo-2'
          | '/server/static/hello/hello-2'
          | '/static/wild/hello/hello-2'
          | '/static/wild/bar'
          | '/static/wild/foo/foo-2/foo-3'
        >
      >(true);
    });
  });
});

const defineRouterMock = unstable_defineRouter as MockedFunction<
  typeof unstable_defineRouter
>;

vi.mock('../src/router/define-router.js', () => ({
  unstable_defineRouter: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

function injectedFunctions() {
  expect(defineRouterMock).toHaveBeenCalledTimes(1);
  assert(defineRouterMock.mock.calls[0]?.[0].getConfig);
  assert(defineRouterMock.mock.calls[0]?.[0].handleRoute);
  assert(defineRouterMock.mock.calls[0]?.[0].handleApi);
  return {
    getConfig: defineRouterMock.mock.calls[0][0].getConfig,
    handleRoute: defineRouterMock.mock.calls[0][0].handleRoute,
    handleApi: defineRouterMock.mock.calls[0][0].handleApi,
  };
}

describe('createPages pages and layouts', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();

    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
      },
    ]);

    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test']);
  });

  it('creates a simple dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test']);
  });

  it('creates a simple static api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      }),
    ]);
    const { getConfig, handleApi } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'api',
        path: [{ type: 'literal', name: 'test' }],
        isStatic: true,
      },
    ]);
    const res = await handleApi(
      new Request(new URL('http://localhost:3000/test')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple dynamic api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test/[slug]',
        render: 'dynamic',
        handlers: {
          GET: async () => {
            return new Response('Hello World');
          },
        },
      }),
    ]);
    const { getConfig, handleApi } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'test' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: false,
      },
    ]);
    const res = await handleApi(
      new Request(new URL('http://localhost:3000/test/foo')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple static page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'static',
        path: '/',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);

    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: true },
          'page:/test': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test', 'layout:/']);
  });

  it('creates a simple dynamic page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'dynamic',
        path: '/',
        component: TestLayout,
      }),
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      }),
    ]);

    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: false },
          'page:/test': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
      },
    ]);

    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test', 'layout:/']);
  });

  it('creates a simple static slice', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'static',
        path: '/',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfig } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [],
        isStatic: true,
      },
      { type: 'slice', id: 'slice001', isStatic: true },
    ]);
  });

  it('creates a simple dynamic page with slices', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfig } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [],
        isStatic: false,
      },
      { type: 'slice', id: 'slice001', isStatic: true },
    ]);
  });

  it('creates a wildcard page with slices', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[...wildcard]',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfig } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'wildcard', type: 'wildcard' },
        ],
        isStatic: false,
      },
      { type: 'slice', id: 'slice001', isStatic: true },
    ]);
  });

  it('creates a nested static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/nested',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/nested', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/nested']);
  });

  it('creates a nested static page with nested layout', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage, createLayout }) => [
      createPage({
        render: 'static',
        path: '/test/nested',
        component: TestPage,
      }),
      createLayout({
        render: 'static',
        path: '/test/nested',
        component: () => null,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': { isStatic: true },
          'layout:/test/nested': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/nested', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'page:/test/nested',
      'layout:/test/nested',
    ]);
  });

  it('creates a nested dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/nested',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: false,
      },
    ]);

    const route = await handleRoute('/test/nested', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/nested']);
  });

  it('creates a static page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        staticPaths: [
          ['w', 'x'],
          ['y', 'z'],
        ],
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/w/x': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'w', type: 'literal' },
          { name: 'x', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: true,
      },
      {
        type: 'route',
        elements: {
          'page:/test/y/z': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'y', type: 'literal' },
          { name: 'z', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/y/z', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/y/z']);
  });

  it('creates a dynamic page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[a]/[b]',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[a]/[b]': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: false,
      },
    ]);
    const route = await handleRoute('/test/w/x', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/[a]/[b]']);
  });

  it('creates a static page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...path]',
        staticPaths: [['a', 'b']],
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/a/b': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'literal' },
          { name: 'b', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'path', type: 'wildcard' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/a/b', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/a/b']);
  });

  it('creates a dynamic page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[...path]',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...path]': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'path', type: 'wildcard' },
        ],
        isStatic: false,
      },
    ]);
    const route = await handleRoute('/test/a/b', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/[...path]']);
  });

  it('creates a dynamic catch-all route that handles index', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/[...catchAll]',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/[...catchAll]': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'catchAll', type: 'wildcard' }],
        isStatic: false,
      },
    ]);

    // Test index route
    const indexRoute = await handleRoute('/', {
      query: '?skip=[]',
    });
    expect(indexRoute).toBeDefined();
    expect(indexRoute.rootElement).toBeDefined();
    expect(indexRoute.routeElement).toBeDefined();
    expect(Object.keys(indexRoute.elements)).toEqual(['page:/[...catchAll]']);

    // Test regular routes
    const regularRoute = await handleRoute('/foo/bar', {
      query: '?skip=[]',
    });
    expect(regularRoute).toBeDefined();
    expect(Object.keys(regularRoute.elements)).toEqual(['page:/[...catchAll]']);
  });

  it('fails if static paths do not match the slug pattern', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        // @ts-expect-error: staticPaths should be an array of strings or [string, string][]
        staticPaths: [['w']] as const,
        component: () => null,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    await expect(getConfig).rejects.toThrowError(
      'staticPaths does not match with slug pattern',
    );
  });

  it('allows to disable SSR on static and dynamic pages', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/static',
        component: () => null,
        unstable_disableSSR: true,
      }),
      createPage({
        render: 'dynamic',
        path: '/dynamic',
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/static': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: true,
        path: [{ name: 'static', type: 'literal' }],
        isStatic: true,
      },
      {
        type: 'route',
        elements: {
          'page:/dynamic': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: true,
        path: [{ name: 'dynamic', type: 'literal' }],
        isStatic: false,
      },
    ]);
  });

  it('fails if duplicated dynamic paths are registered', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    await expect(getConfig).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails if duplicated static paths are registered', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    await expect(getConfig).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails if duplicated static and dynamic paths override each other', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    await expect(getConfig).rejects.toThrowError('Duplicated path: /test');
  });

  it('creates a complex router', async () => {
    const TestPage = vi.fn();
    complexTestRouter(createPages, TestPage);

    const { getConfig, handleRoute } = injectedFunctions();

    expect(await getConfig()).toEqual([
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'foo',
          },
          {
            type: 'literal',
            name: 'foo-2',
          },
          {
            type: 'literal',
            name: 'foo-3',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/static/wild/foo/foo-2/foo-3': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo',
          },
          {
            type: 'literal',
            name: 'static-echo-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/static/static-echo/static-echo-2': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'hello',
          },
          {
            type: 'literal',
            name: 'hello-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/static/hello/hello-2': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'hello',
          },
          {
            type: 'literal',
            name: 'hello-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/static/wild/hello/hello-2': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'two',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/two/[echo]/[echo2]': {
            isStatic: false,
          },
        },
        noSsr: false,
        isStatic: false,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'oneAndWild',
          },
          {
            type: 'group',
            name: 'slug',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/oneAndWild/[slug]/[...wild]': {
            isStatic: false,
          },
        },
        noSsr: false,
        isStatic: false,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/static/static-echo': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/static/static-echo-2': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'bar',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/static/wild/bar': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'one',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/one/[echo]': {
            isStatic: false,
          },
        },
        noSsr: false,
        isStatic: false,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/server/wild/[...wild]': {
            isStatic: false,
          },
        },
        noSsr: false,
        isStatic: false,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'client',
          },
          {
            type: 'literal',
            name: 'static',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/client/static': {
            isStatic: true,
          },
        },
        noSsr: false,
        isStatic: true,
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'client',
          },
          {
            type: 'literal',
            name: 'dynamic',
          },
        ],
        rootElement: {
          isStatic: true,
        },
        routeElement: {
          isStatic: true,
        },
        elements: {
          'page:/client/dynamic': {
            isStatic: false,
          },
        },
        noSsr: false,
        isStatic: false,
      },
    ]);
    const route = await handleRoute('/server/two/a/b', {
      query: '?skip=[]',
    });
    assert(route);
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'page:/server/two/[echo]/[echo2]',
    ]);
  });
});

describe('createPages api', () => {
  it('creates a simple static api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      }),
    ]);
    const { getConfig, handleApi } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'api',
        path: [{ type: 'literal', name: 'test' }],
        isStatic: true,
      },
    ]);
    const res = await handleApi(
      new Request(new URL('http://localhost:3000/test')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple dynamic api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test/[slug]',
        render: 'dynamic',
        handlers: {
          GET: async (req) => {
            return new Response('Hello World ' + req.url.split('/').at(-1)!);
          },
        },
      }),
    ]);
    const { getConfig, handleApi } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'test' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: false,
      },
    ]);
    const res = await handleApi(
      new Request(new URL('http://localhost:3000/test/foo')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World foo');
    expect(res.status).toEqual(200);
  });
});

describe('createPages - exactPath', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test']);
  });

  it('creates a simple dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: false },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test']);
  });

  it('works with a slug path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[slug]': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/[slug]', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/[slug]']);
  });

  it('works with a wildcard path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...wildcard]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[...wildcard]', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/[...wildcard]', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/[...wildcard]']);
  });

  it('works with wildcard and slug path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...wildcard]/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]/[slug]': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[...wildcard]', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/[...wildcard]/[slug]', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'page:/test/[...wildcard]/[slug]',
    ]);
  });

  it('does not work with slug match', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[slug]': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    await expect(async () => {
      return handleRoute('/test/foo', {
        query: '?skip=[]',
      });
    }).rejects.toThrowError();
  });
});

describe('createPages - grouped paths', () => {
  it('path with group', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test']);
  });

  it('path with nested group', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(a)/test/(b)/foo',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/foo': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'foo', type: 'literal' },
        ],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test/foo', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['page:/test/foo']);
  });

  it('fails when group path collides with literal', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfig } = injectedFunctions();
    await expect(getConfig).rejects.toThrowError('Duplicated path: /test');
  });

  it('supports grouped path with slug', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/[slug]',
        staticPaths: ['x', 'y'],
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/(group)/z',
        component: TestPage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: { 'page:/x': { isStatic: true } },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ type: 'literal', name: 'x' }],
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
      },
      {
        type: 'route',
        elements: { 'page:/y': { isStatic: true } },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        path: [{ type: 'literal', name: 'y' }],
        noSsr: false,
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
      },
      {
        type: 'route',
        elements: { 'page:/z': { isStatic: true } },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ type: 'literal', name: 'z' }],
        isStatic: true,
      },
    ]);

    const routeX = await handleRoute('/x', { query: '?skip=[]' });
    expect(routeX).toBeDefined();
    expect(routeX.rootElement).toBeDefined();
    expect(routeX.routeElement).toBeDefined();
    expect(Object.keys(routeX.elements)).toEqual(['page:/x']);

    const routeY = await handleRoute('/y', { query: '?skip=[]' });
    expect(routeY).toBeDefined();
    expect(routeY.rootElement).toBeDefined();
    expect(routeY.routeElement).toBeDefined();
    expect(Object.keys(routeY.elements)).toEqual(['page:/y']);

    const routeZ = await handleRoute('/z', { query: '?skip=[]' });
    expect(routeZ).toBeDefined();
    expect(routeZ.rootElement).toBeDefined();
    expect(routeZ.routeElement).toBeDefined();
    expect(Object.keys(routeZ.elements)).toEqual(['page:/z']);
  });

  it('supports grouped path with layout', async () => {
    const TestPage = () => null;
    const TestHomePage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    const TestRootLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({ render: 'static', path: '/', component: TestRootLayout }),
      createLayout({
        render: 'static',
        path: '/(group)',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/(group)',
        component: TestHomePage,
      }),
    ]);
    const { getConfig, handleRoute } = injectedFunctions();
    expect(await getConfig()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: true },
          'layout:/(group)': { isStatic: true },
          'page:/test': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
      },
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: true },
          'layout:/(group)': { isStatic: true },
          'layout:/': { isStatic: true },
        },
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [],
        isStatic: true,
      },
    ]);
    const route = await handleRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.rootElement).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'page:/test',
      'layout:/',
      'layout:/(group)',
    ]);

    const route2 = await handleRoute('/', {
      query: '?skip=[]',
    });
    expect(route2).toBeDefined();
    expect(route2.rootElement).toBeDefined();
    expect(route2.routeElement).toBeDefined();
    expect(Object.keys(route2.elements)).toEqual([
      'page:/',
      'layout:/',
      'layout:/(group)',
    ]);
  });
});

describe('pathMappingWithoutGroups', () => {
  it('handles paths with pathless groups', () => {
    const pathSpec = parsePathWithSlug('/(foo)/bar');
    expect(pathMappingWithoutGroups(pathSpec, '/bar')).toEqual({});
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar')).toEqual(null);
  });

  it('handles paths with pathless groups and groups', () => {
    const pathSpec = parsePathWithSlug('/(foo)/bar/[id]');
    expect(pathMappingWithoutGroups(pathSpec, '/bar/123')).toEqual({
      id: '123',
    });
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar/123')).toEqual(null);
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar/[id]')).toEqual(null);
  });
});
