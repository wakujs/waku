import type { ReactNode } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile } from 'node:fs/promises';
// NOTE: I think we need one spec to use non-default adapter
import adapter from 'waku/adapters/node';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
} from 'waku/minimal/client';
import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { Link, Slice } from 'waku/router/client';
import {
  unstable_defineRouter as defineRouter,
  getRequest,
  unstable_parseRouterRequest as parseRouterRequest,
  unstable_redirect as redirect,
  requestNotFound,
  requestRedirect,
  unstable_rerenderRoute as rerenderRoute,
} from 'waku/router/server';
import { NavButton } from './components/nav-button.js';
import { SearchPage } from './components/search-page.js';
import { Slice001 } from './components/slice001.js';
import { Slice002 } from './components/slice002.js';
import { fooRoute } from './lib/routes.js';
import Bar1Page from './routes/bar1/page.js';
import Bar2Page from './routes/bar2/page.js';
import Baz1Page from './routes/baz1/page.js';
import Baz2Page from './routes/baz2/page.js';
import FooPage from './routes/foo/page.js';
import Layout from './routes/layout.js';
import Page from './routes/page.js';

const STATIC_PAGES = [
  '/',
  '/foo',
  '/bar2',
  '/baz2',
  '/static-lazy',
  '/no-ssr-search-static',
  '/server-search-static',
];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar1': <Bar1Page />, // dynamic page + static slice
  '/bar2': <Bar2Page />, // static page + dynamic slice
  '/baz1': <Baz1Page />, // dynamic page + lazy static slice
  '/baz2': <Baz2Page />, // static page + lazy dynamic slice
  '/no-ssr-search': <SearchPage />,
  '/no-ssr-search-static': <SearchPage />,
  '/server-search': (
    <div>
      <Link to={fooRoute({ search: { q: 'server' } })}>Server search</Link>
      <NavButton
        component={Link}
        to={fooRoute({ search: { q: 'composed' } })}
      />
    </div>
  ),
  '/server-search-static': (
    <Link to={fooRoute({ search: { q: 'static' } })}>Static server search</Link>
  ),
  '/static-lazy': (
    <div>
      <h2 data-testid="static-lazy-title">Static lazy</h2>
      <Slice id="slice001" lazy fallback={null} />
    </div>
  ),
};

const root = {
  immutable: true,
  render: () => (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku example</title>
      </head>
      <body>
        <Children />
      </body>
    </html>
  ),
};

const sliceSources = {
  'slice:slice001': { immutable: true, render: () => <Slice001 /> },
  'slice:slice002': { render: () => <Slice002 /> },
};

const requestContext = new AsyncLocalStorage<string>();

const ContextNotFound = async () => {
  await Promise.resolve();
  return (
    <h1>Scoped Not Found: {requestContext.getStore() ?? 'missing context'}</h1>
  );
};

const router = defineRouter({
  unstable_interceptors: [
    (next) =>
      requestContext.run(
        getRequest().headers.get('x-waku-test-context') ?? 'default',
        async () => {
          const request = getRequest();
          const route = parseRouterRequest(request);
          if (
            route?.type === 'route' &&
            route.path === '/interceptor-missing'
          ) {
            requestNotFound();
            cancelRender();
          }
          const gate =
            route?.type === 'route' && route.path === '/interceptor-cache'
              ? request.headers.get('x-waku-test-gate')
              : undefined;
          if (gate === 'before') {
            requestRedirect('/foo');
          }
          const result = await next();
          if (gate === 'after') {
            requestRedirect('/foo');
          }
          return result;
        },
      ),
  ],
  getHas404: async () => true,
  resolve: async (path) => {
    if (path === '/404') {
      return {
        elements: { root, route: { render: () => <ContextNotFound /> } },
      };
    }
    if (path === '/interceptor-cache' || path === '/action-static') {
      return {
        elements: {
          root,
          route: {
            immutable: true,
            render: () => (
              <>
                <h1>
                  {path === '/interceptor-cache'
                    ? 'Allowed page'
                    : 'Static action page'}
                </h1>
                <Link to="/">Home</Link>
                {path === '/action-static' && (
                  <form
                    action={async () => {
                      'use server';
                      rerenderRoute('/action-static');
                      requestRedirect('/foo');
                    }}
                  >
                    <button type="submit">Redirect action</button>
                  </form>
                )}
              </>
            ),
          },
        },
      };
    }
    if (path === '/typed-redirect') {
      redirect(fooRoute({ search: { q: 'redirected' } }));
    }
    if (path === '/api/hi') {
      return async (req) => {
        if (req.method === 'GET') {
          return new Response('hello world!');
        }
        if (req.method === 'POST') {
          return new Response('POST to hello world! ' + (await req.text()));
        }
        return new Response(null, { status: 404 });
      };
    }
    if (path === '/api/hi.txt') {
      return async () => new Response(await readFile('./private/hi.txt'));
    }
    if (path === '/api/empty') {
      return async () => new Response(null, { status: 200 });
    }
    if (path === '/moved' || path === '/moved-hash') {
      return {
        elements: {
          root,
          route: {
            render: () => redirect(path === '/moved' ? '/foo' : '/foo#bottom'),
          },
        },
      };
    }
    if (!(path in PATH_PAGE)) {
      return null;
    }
    return {
      noSsr: path === '/no-ssr-search' || path === '/no-ssr-search-static',
      elements: {
        root,
        route: {
          immutable: true,
          render: () => (
            <Slot id="layout:/">
              <Slot id={`page:${path}`} />
            </Slot>
          ),
        },
        'layout:/': {
          immutable: true,
          render: () => (
            <Layout>
              <Children />
            </Layout>
          ),
        },
        [`page:${path}`]: {
          immutable: STATIC_PAGES.includes(path),
          render: () => PATH_PAGE[path],
        },
        ...(path === '/' || path === '/bar1'
          ? { 'slice:slice001': sliceSources['slice:slice001'] }
          : {}),
        ...(path === '/bar2'
          ? { 'slice:slice002': sliceSources['slice:slice002'] }
          : {}),
      },
    };
  },
  getBuildPaths: async () => [...Object.keys(PATH_PAGE), '/api/empty'],
  getBuildElementIds: async () => ['slice:slice001'],
  resolveElement: async (id) =>
    sliceSources[id as keyof typeof sliceSources] || null,
});

// This runtime-only route deliberately has no interceptors or build cache.
const AsyncPage = async () => {
  await Promise.resolve();
  if (getRequest().headers.get('x-waku-test-gate') === 'deny') {
    requestRedirect('/foo');
  }
  return (
    <>
      <h1>Async page</h1>
      <Link to="/">Home</Link>
    </>
  );
};

const runtimeRouter = defineRouter({
  getHas404: async () => false,
  resolve: async () => ({
    elements: {
      root,
      route: { immutable: true, render: () => <AsyncPage /> },
    },
  }),
});

export default adapter({
  ...router,
  handleRequest: (input, utils) => {
    const route = parseRouterRequest(input.req);
    return route?.type === 'route' && route.path === '/async-cache'
      ? runtimeRouter.handleRequest(input, utils)
      : router.handleRequest(input, utils);
  },
});
