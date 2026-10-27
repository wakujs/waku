import type { ReactNode } from 'react';
import { Suspense } from 'react';
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
let releaseFragment: (() => void) | undefined;

const LateFragmentRedirect = async () => {
  await new Promise<void>((resolve) => {
    releaseFragment = resolve;
  });
  requestRedirect('/fragment-late#comments');
  return null;
};

const ContextNotFound = async () => {
  await Promise.resolve();
  return (
    <h1>Scoped Not Found: {requestContext.getStore() ?? 'missing context'}</h1>
  );
};

const routerOptions: Parameters<typeof defineRouter>[0] = {
  getHas404: async () => true,
  resolve: async (path) => {
    if (path === '/etag-redirect' || path === '/etag-not-found') {
      return {
        elements: {
          root,
          route: {
            getEtag: async () => 'gated-v1',
            render: () => {
              if (path === '/etag-redirect') {
                requestRedirect('/foo');
              } else {
                requestNotFound();
              }
              cancelRender();
            },
          },
        },
      };
    }
    if (path === '/fragment-release') {
      return async () => {
        const release = releaseFragment;
        if (!release) {
          return new Response('No pending fragment', { status: 404 });
        }
        releaseFragment = undefined;
        release();
        return new Response(null, { status: 204 });
      };
    }
    if (path === '/fragment-ready' || path === '/fragment-late') {
      return {
        elements: {
          root,
          route: {
            render: () => {
              if (path === '/fragment-ready') {
                requestRedirect(path + '#comments');
              }
              return (
                <>
                  <h1>Fragment {path.slice('/fragment-'.length)}</h1>
                  <Link to={path + '#other'}>Other section</Link>
                  <p id="comments">Comments</p>
                  <p id="other">Other section</p>
                  {path === '/fragment-late' && (
                    <Suspense fallback={null}>
                      <LateFragmentRedirect />
                    </Suspense>
                  )}
                </>
              );
            },
          },
        },
      };
    }
    if (path === '/404') {
      if (getRequest().headers.has('x-waku-test-cancel-404')) {
        requestNotFound();
        cancelRender();
      }
      return {
        elements: { root, route: { render: () => <ContextNotFound /> } },
      };
    }
    if (
      path === '/guarded-form-redirect' ||
      path === '/guarded-form-not-found'
    ) {
      return {
        elements: {
          root,
          route: {
            render: () => {
              if (getRequest().method === 'POST') {
                if (path === '/guarded-form-redirect') {
                  requestRedirect('/foo');
                } else {
                  requestNotFound();
                }
                cancelRender();
              }
              return (
                <form
                  action={async () => {
                    'use server';
                    throw new Error('Guarded form action must not execute');
                  }}
                >
                  <button type="submit">Submit guarded action</button>
                </form>
              );
            },
          },
        },
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
    if (path === '/absolute-redirect') {
      requestRedirect(new URL('/api/hi', getRequest().url));
      cancelRender();
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
  resolveElement: async (id) => {
    if (id === 'slice:guarded-redirect') {
      requestRedirect('/foo');
    } else if (id === 'slice:guarded-not-found') {
      requestNotFound();
    }
    return sliceSources[id as keyof typeof sliceSources] || null;
  },
};

const router = defineRouter(routerOptions);
const interceptedRouter = defineRouter({
  ...routerOptions,
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
          }
          const gate =
            route?.type === 'route' && route.path === '/interceptor-cache'
              ? request.headers.get('x-waku-test-gate')
              : undefined;
          if (gate === 'deny') {
            requestRedirect('/foo');
          }
          if (gate === 'missing') {
            requestNotFound();
          }
          const result = await next();
          if (gate && result instanceof Response) {
            result.headers.append(
              'set-cookie',
              'session=interceptor; HttpOnly; Path=/',
            );
            result.headers.append('set-cookie', 'preferences=compact; Path=/');
            result.headers.set('x-waku-test-interceptor', 'kept');
          }
          if (gate === 'after') {
            requestRedirect('/foo');
          } else if (gate === 'after-not-found') {
            requestNotFound();
          }
          return result;
        },
      ),
  ],
});

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
    if (
      route?.type === 'route' &&
      (route.path === '/interceptor-cache' ||
        route.path === '/interceptor-missing')
    ) {
      return interceptedRouter.handleRequest(input, utils);
    }
    return route?.type === 'route' && route.path === '/async-cache'
      ? runtimeRouter.handleRequest(input, utils)
      : router.handleRequest(input, utils);
  },
});
