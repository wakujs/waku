// @vitest-environment happy-dom

import {
  Suspense,
  act,
  use,
  useCallback,
  useLayoutEffect,
  useRef,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  ETAGS_HEADER,
  parseClientEtags,
} from '../src/lib/utils-isomorphic/etags.js';
import { createRenderUtils } from '../src/lib/utils-server/render.js';
import { unstable_callServerRsc as callServerRsc } from '../src/minimal/client-runtime.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { unstable_parseRequest as parseRequest } from '../src/minimal/server.js';
import {
  unstable_decideFollow as decideFollow,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_has404FromElements as has404FromElements,
  unstable_isStaticFromElements as isStaticFromElements,
  useActionRouting_UNSTABLE as useActionRouting,
  useRouterCache_UNSTABLE as useRouterCache,
} from '../src/router/client-core.js';
import {
  unstable_defineRouter as defineRouter,
  unstable_notFound as notFound,
  unstable_redirect as redirect,
  unstable_rerenderRoute as rerenderRoute,
} from '../src/router/server.js';

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: async (response: Promise<Response>) =>
      (await response).json(),
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

vi.mock('../src/server.js', () => ({
  serializeRsc: async (value: unknown) =>
    new TextEncoder().encode(JSON.stringify(value)),
  deserializeRsc: async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
}));

type Elements = Readonly<Record<string | symbol, unknown>>;

const roots: ReturnType<typeof createRoot>[] = [];
const pending: (() => void)[] = [];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  window.history.replaceState({}, '', '/start');
});

afterEach(async () => {
  await act(async () => roots.splice(0).forEach((root) => root.unmount()));
  await act(async () => pending.splice(0).forEach((resolve) => resolve()));
  document.body.replaceChildren();
  clearInitialRscEntries();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const route = (content: string, immutable = false) => ({
  elements: {
    root: { immutable: true, render: () => 'root' },
    route: { immutable, render: () => content },
  },
});

const noPendingRoute = () => undefined;

const mount = async (
  router: ReturnType<typeof defineRouter>,
  path: string,
  query = '',
  action: () => Promise<unknown> = async () => undefined,
) => {
  const payloads: Record<string, unknown>[] = [];
  const renderUtils = createRenderUtils({
    temporaryReferences: undefined,
    renderToReadableStream: (data) => {
      payloads.push(data as Record<string, unknown>);
      return new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(data)));
          controller.close();
        },
      });
    },
    loadSsrEntryModule: async () => {
      throw new Error('This binding only fetches RSC');
    },
    buildId: '',
    onError: () => undefined,
  });
  const fetch = vi.fn<typeof globalThis.fetch>(async (url, init) => {
    const req = new Request(new URL(String(url), window.location.href), init);
    const parsed = parseRequest(req);
    if (!parsed || parsed.type === 'http') {
      throw new Error('Expected an RSC request');
    }
    const result = await router.handleRequest(
      {
        ...(parsed.type === 'call'
          ? { ...parsed, fn: action, args: [] }
          : parsed),
        req,
        pathname: new URL(req.url).pathname,
        etags: parseClientEtags(req.headers.get(ETAGS_HEADER)),
      },
      { ...renderUtils, loadBuildMetadata: async () => undefined },
    );
    return new Response(result instanceof ReadableStream ? result : null);
  });
  vi.stubGlobal('fetch', fetch);
  let view!: {
    elements: Elements;
    fetchRsc: ReturnType<typeof useFetchRsc>;
    mergeElements: ReturnType<typeof useMergeElements>;
    cache: ReturnType<typeof useRouterCache>;
  };
  const onRouteChange = vi.fn();
  const Probe = () => {
    const elements = use(useElementsPromise());
    const fetchRsc = useFetchRsc();
    const mergeElements = useMergeElements();
    const cache = useRouterCache();
    const settled = useRef(elements);
    const getSettledRoute = useCallback(
      () => getRouteFromElements(settled.current)!,
      [],
    );
    useActionRouting({
      getSettledRoute,
      getPendingRoute: noPendingRoute,
      onRouteChange,
    });
    useLayoutEffect(() => {
      settled.current = elements;
      cache.learnStaticFromElements(elements);
      view = { elements, fetchRsc, mergeElements, cache };
    }, [elements, fetchRsc, mergeElements, cache]);
    return <Slot id={getRouteSlotId(getRouteFromElements(elements)!.path)} />;
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => {
    root.render(
      <Suspense fallback="pending">
        <Root
          initialRscPath={encodeRoutePath(path)}
          initialRscParams={new URLSearchParams({ query })}
        >
          <Probe />
        </Root>
      </Suspense>,
    );
  });
  return { getView: () => view, container, fetch, payloads, onRouteChange };
};

test('immutable route identities do not collide across paths or imply a static page', async () => {
  const router = defineRouter({
    resolve: async (path) =>
      path === '/dynamic'
        ? {
            elements: {
              ...route('dynamic shell', true).elements,
              page: { render: () => 'mutable page' },
            },
          }
        : route(path, true),
    getHas404: async () => false,
  });
  const binding = await mount(router, '/first');
  let view = binding.getView();
  expect(
    view.cache.canReuseStaticRoute(
      { path: '/first', query: '', hash: '' },
      view.elements,
    ),
  ).toBe(true);
  expect(
    view.cache.hasCachedShell(
      { path: '/second', query: '', hash: '' },
      view.elements,
    ),
  ).toBe(false);
  await act(async () => {
    await view.mergeElements(
      view.fetchRsc(encodeRoutePath('/second'), undefined, {
        unstable_base: view.elements,
      }),
    );
  });
  view = binding.getView();
  expect(binding.container.textContent).toBe('/second');
  expect(view.elements[getRouteSlotId('/first')]).toBe('/first');
  expect(view.elements[getRouteSlotId('/second')]).toBe('/second');
  const dynamic = await view.fetchRsc(encodeRoutePath('/dynamic'));
  expect(
    view.cache.hasCachedShell(
      { path: '/dynamic', query: '', hash: '' },
      dynamic,
    ),
  ).toBe(true);
  view.cache.learnStaticFromElements(dynamic);
  expect(
    view.cache.canReuseStaticRoute(
      { path: '/dynamic', query: '', hash: '' },
      dynamic,
    ),
  ).toBe(false);
});

test('an omitted mutable slot still keeps the response route dynamic', async () => {
  const router = defineRouter({
    resolve: async () => ({
      elements: {
        ...route('shell', true).elements,
        page: { getEtag: async () => 'v1', render: () => 'page' },
      },
    }),
    getHas404: async () => false,
  });
  const binding = await mount(router, '/page', 'q=one');
  const { fetchRsc, elements } = binding.getView();
  const refreshed = await fetchRsc(
    encodeRoutePath('/page'),
    new URLSearchParams({ query: 'q=two' }),
    { unstable_base: elements },
  );
  expect(binding.payloads.at(-1)).not.toHaveProperty('page');
  expect(binding.payloads.at(-1)).not.toHaveProperty(getRouteSlotId('/page'));
  expect(refreshed.page).toBe('page');
  expect(isStaticFromElements(refreshed)).toBe(false);
  expect(getRouteFromElements(refreshed)).toEqual({
    path: '/page',
    query: 'q=two',
    hash: '',
  });
});

test('an eagerly resolved redirect reports the rendered destination to the client', async () => {
  const binding = await mount(
    defineRouter({
      resolve: async (path, query) => {
        if (path === '/old') {
          redirect('/new?q=one');
        }
        return route(path + '?' + query);
      },
      getHas404: async () => false,
    }),
    '/old',
  );
  expect(binding.fetch).toHaveBeenCalledOnce();
  expect(binding.container.textContent).toBe('/new?q=one');
  expect(getRouteFromElements(binding.getView().elements)).toEqual({
    path: '/new',
    query: 'q=one',
    hash: '',
  });
});

test('a custom 404 reports its rendered route and enables following late not-found errors', async () => {
  const binding = await mount(
    defineRouter({
      resolve: async (path, query) =>
        path === '/404' ? route('not found: ' + query) : null,
    }),
    '/missing',
    'q=one',
  );
  const elements = binding.getView().elements;
  expect(binding.container.textContent).toBe('not found: q=one');
  expect(getRouteFromElements(elements)).toEqual({
    path: '/404',
    query: 'q=one',
    hash: '',
  });
  let error: unknown;
  try {
    notFound();
  } catch (caught) {
    error = caught;
  }
  const url = new URL('http://localhost/missing?q=one');
  const decision = decideFollow(
    error,
    { route: { path: '/missing', query: 'q=one' }, url, follows: 0 },
    { has404: has404FromElements(elements), maxFollows: 20 },
  );
  expect(decision).toMatchObject({
    type: 'follow',
    target: { path: '/404', query: 'q=one' },
  });
  expect(decision.type === 'follow' && decision.url.href).toBe(url.href);
});

test('origin refreshes are dropped after navigating away, but explicit action destinations still land', async () => {
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => {
    finish = resolve;
  });
  pending.push(finish);
  let explicit = false;
  const binding = await mount(
    defineRouter({
      resolve: async (path) => route(path),
      getHas404: async () => false,
    }),
    '/first',
    '',
    async () => {
      await gate;
      if (explicit) {
        await rerenderRoute('/first');
      } else {
        await rerenderRoute();
      }
      return 'returned';
    },
  );
  const action = callServerRsc('action#refresh', []);
  await act(async () => {
    const view = binding.getView();
    await view.mergeElements(view.fetchRsc(encodeRoutePath('/second')));
  });
  await act(async () => {
    finish();
    expect(await action).toBe('returned');
  });
  expect(binding.container.textContent).toBe('/second');
  expect(binding.onRouteChange).not.toHaveBeenCalled();
  explicit = true;
  await act(async () => {
    expect(await callServerRsc('action#refresh', [])).toBe('returned');
  });
  expect(binding.container.textContent).toBe('/first');
  expect(binding.onRouteChange).toHaveBeenCalledExactlyOnceWith({
    path: '/first',
    query: '',
    hash: '',
  });
});
