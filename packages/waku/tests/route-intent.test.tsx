// @vitest-environment happy-dom

import { Suspense, act, use, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_ID } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc } from '../src/minimal/client-runtime.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Children_UNSTABLE as Children,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useFetchRsc_UNSTABLE as useFetchRsc,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { Router, useRouter } from '../src/router/client.js';
import {
  HAS404_ID,
  INTENT_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  encodeSliceId,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';
import type { RouteIntentData } from '../src/router/isomorphic-utils/router-protocol.js';
import {
  unstable_defineRouter,
  unstable_notFound,
  unstable_redirect,
} from '../src/router/server.js';

type Elements = Readonly<Record<string | symbol, unknown>>;
const mocks = vi.hoisted(() => ({
  queue: [] as Array<Elements | Promise<Elements>>,
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: (response: Promise<Response>) => {
      const elements = mocks.queue.shift();
      if (!elements) {
        throw new Error('Unexpected RSC request');
      }
      return response.then(() => elements);
    },
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
}));

vi.mock('../src/server.js', () => ({
  serializeRsc: vi.fn(),
  deserializeRsc: vi.fn(),
}));

const defer = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};
const deferIntent = () => {
  const deferred = defer<string | undefined>();
  return {
    promise: deferred.promise,
    resolve: (value: RouteIntentData | null) =>
      deferred.resolve(value === null ? undefined : JSON.stringify(value)),
  };
};
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
let root: ReturnType<typeof createRoot> | undefined;
let controls: {
  router: ReturnType<typeof useRouter>;
  fetch: ReturnType<typeof useFetchRsc>;
  merge: ReturnType<typeof useMergeElements>;
  elements: Elements;
};

const Probe = () => {
  const router = useRouter();
  const fetch = useFetchRsc();
  const merge = useMergeElements();
  const elements = use(useElementsPromise());
  useLayoutEffect(() => {
    controls = { router, fetch, merge, elements };
  });
  return <output>{router.path}</output>;
};

const payload = (
  path: string,
  intent: Promise<string | undefined> = Promise.resolve(undefined),
  isStatic = false,
): Elements => ({
  root: (
    <>
      <Probe />
      <Children />
    </>
  ),
  [ROUTE_ID]: [path, ''],
  [IS_STATIC_ID]: isStatic,
  [INTENT_ID]: intent,
  [getRouteSlotId(path)]: <p>Page {path}</p>,
  ...(isStatic ? { [ETAGS_ID]: { root: 1, [getRouteSlotId(path)]: 1 } } : {}),
});

const mount = async (path = '/one') => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Suspense fallback={null}>
        <Router initialRoute={{ path, query: '', hash: '' }} />
      </Suspense>,
    );
    await flush();
  });
  return container;
};

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}')),
  );
  window.history.replaceState({}, '', '/one');
  clearInitialRscEntries();
  mocks.queue = [];
});

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  clearInitialRscEntries();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('a navigation commits while its intent stays pending', async () => {
  mocks.queue.push(payload('/one'));
  const view = await mount();
  const pending = deferIntent();
  mocks.queue.push(payload('/two', pending.promise));
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(controls.elements[INTENT_ID]).toBe(pending.promise);
});

test.each(['redirect', 'notFound', 'notFoundWithoutPage'] as const)(
  'a cancelled resolver follows %s from a pending navigation',
  async (kind) => {
    mocks.queue.push(payload('/one'));
    const view = await mount();
    const router = unstable_defineRouter({
      resolve: async () =>
        kind === 'redirect' ? unstable_redirect('/done') : unstable_notFound(),
      getHas404: async () => kind === 'notFound',
    });
    let elements!: Elements;
    await router.handleRequest(
      {
        type: 'rsc',
        pathname: '/RSC/R/gate',
        rscPath: 'R/gate',
        rscParams: new URLSearchParams({ query: 'q=one' }),
        req: new Request('http://localhost/RSC/R/gate'),
      },
      {
        renderRsc: async (data) => {
          elements = data;
          return new ReadableStream({
            start(controller) {
              controller.close();
            },
          });
        },
        renderHtml: vi.fn(),
        renderHtmlFallback: vi.fn(),
        loadBuildMetadata: vi.fn(),
      },
    );
    const destination = kind === 'redirect' ? '/done' : '/404';
    mocks.queue.push(elements);
    if (kind !== 'notFoundWithoutPage') {
      mocks.queue.push(payload(destination));
    }
    await act(async () => {
      await controls.router.push('/gate?q=one');
      await flush();
    });
    expect(window.location.pathname + window.location.search).toBe(
      kind === 'redirect' ? '/done' : '/gate?q=one',
    );
    expect(view.textContent).toContain(
      kind === 'notFoundWithoutPage' ? 'Not Found' : 'Page ' + destination,
    );
  },
);

test('a self redirect stops before another request is sent', async () => {
  const intent = deferIntent();
  mocks.queue.push(payload('/one', intent.promise));
  await mount();
  const requests = vi.mocked(fetch).mock.calls.length;
  await expect(
    act(async () => {
      intent.resolve({ status: 307, location: '/one' });
      await flush();
    }),
  ).rejects.toThrow('detected a navigation loop');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('notFound without a custom page shows the fallback at the requested URL', async () => {
  const intent = deferIntent();
  mocks.queue.push(payload('/one', intent.promise));
  const view = await mount();
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    intent.resolve({ status: 404 });
    await flush();
  });
  expect(view.textContent).toContain('Not Found');
  expect(window.location.pathname).toBe('/one');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('a not-found intent shows the sibling fallback when the root slot is null', async () => {
  const pending = deferIntent();
  mocks.queue.push({ ...payload('/one', pending.promise), root: null });
  const view = await mount();
  await act(async () => {
    pending.resolve({ status: 404 });
    await flush();
  });
  expect(view.querySelector('h1')?.textContent).toBe('Not Found');
  expect(window.location.pathname).toBe('/one');
});

test.each(['slice', 'action'] as const)(
  'a normal %s response preserves the active page intent',
  async (kind) => {
    const pending = deferIntent();
    mocks.queue.push(payload('/one', pending.promise));
    const view = await mount();
    mocks.queue.push({
      [INTENT_ID]: Promise.resolve(undefined),
      sidebar: 'updated',
      _value: 'saved',
    });
    await act(async () => {
      if (kind === 'action') {
        expect(await unstable_callServerRsc('actions#save', [])).toBe('saved');
      } else {
        await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
      }
      await flush();
    });
    expect(controls.elements[INTENT_ID]).toBe(pending.promise);
    mocks.queue.push(payload('/done'));
    await act(async () => {
      pending.resolve({ status: 307, location: '/done' });
      await flush();
    });
    expect(window.location.pathname).toBe('/done');
    expect(view.textContent).toContain('Page /done');
  },
);

test('a partial intent is observed while the page intent remains pending', async () => {
  const page = deferIntent();
  const partial = deferIntent();
  mocks.queue.push(payload('/one', page.promise));
  const view = await mount();
  mocks.queue.push({ [INTENT_ID]: partial.promise, sidebar: 'loaded' });
  await act(async () => {
    await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
    await flush();
  });
  expect(controls.elements[INTENT_ID]).toBe(page.promise);
  mocks.queue.push(payload('/done'));
  await act(async () => {
    partial.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
  page.resolve(null);
});

test('a partial fetch in an initial descendant layout effect observes its intent without a merge', async () => {
  const FetchOnMount = () => {
    const fetchRsc = useFetchRsc();
    useLayoutEffect(() => {
      void fetchRsc(encodeSliceId('sidebar'));
    }, [fetchRsc]);
    return <p>Page /one</p>;
  };
  mocks.queue.push(
    { ...payload('/one'), [getRouteSlotId('/one')]: <FetchOnMount /> },
    {
      [INTENT_ID]: Promise.resolve(
        JSON.stringify({ status: 307, location: '/done' }),
      ),
      sidebar: 'loaded',
    },
    payload('/done'),
  );
  const view = await mount();
  await act(async () => {
    await flush();
  });
  expect(view.textContent).toContain('Page /done');
  expect(window.location.pathname).toBe('/done');
});

test('a late page intent cannot leave a reused static route', async () => {
  window.history.replaceState({}, '', '/two');
  mocks.queue.push(payload('/two', Promise.resolve(undefined), true));
  const view = await mount('/two');
  const pending = deferIntent();
  mocks.queue.push(payload('/one', pending.promise));
  await act(async () => {
    await controls.router.push('/one');
    await flush();
  });
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('a partial intent is ignored after its originating route was left', async () => {
  const pending = deferIntent();
  mocks.queue.push(payload('/one'));
  const view = await mount();
  mocks.queue.push({ [INTENT_ID]: pending.promise, sidebar: 'loaded' });
  await act(async () => {
    await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
    await flush();
  });
  mocks.queue.push(payload('/two'));
  await act(async () => {
    await controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('an old intent cannot supersede a newer pending navigation', async () => {
  const pending = deferIntent();
  const destination = defer<Elements>();
  mocks.queue.push(payload('/one', pending.promise));
  const view = await mount();
  mocks.queue.push(destination.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.router.push('/two');
    await flush();
  });
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    pending.resolve({ status: 307, location: '/wrong' });
    await flush();
  });
  expect(view.textContent).toContain('Page /one');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
  await act(async () => {
    destination.resolve(payload('/two'));
    await pushed;
    await flush();
  });
  expect(window.location.pathname).toBe('/two');
  expect(view.textContent).toContain('Page /two');
});

test.each(['page', 'slice', 'action'] as const)(
  'a rejected %s intent cannot interrupt a newer pending navigation',
  async (source) => {
    const pending = defer<string | undefined>();
    const destination = defer<Elements>();
    mocks.queue.push(
      payload('/one', source === 'page' ? pending.promise : undefined),
    );
    const view = await mount();
    if (source !== 'page') {
      mocks.queue.push({ [INTENT_ID]: pending.promise });
      await act(async () => {
        if (source === 'action') {
          await unstable_callServerRsc('actions#save', []);
        } else {
          await controls.merge(await controls.fetch(encodeSliceId('sidebar')));
        }
        await flush();
      });
    }
    mocks.queue.push(destination.promise);
    let pushed!: Promise<void>;
    await act(async () => {
      pushed = controls.router.push('/two');
      await flush();
    });
    await act(async () => {
      pending.reject(new Error('old response disconnected'));
      await flush();
    });
    expect(view.textContent).toContain('Page /one');
    await act(async () => {
      destination.resolve(payload('/two'));
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('Page /two');
    expect(window.location.pathname).toBe('/two');
  },
);

test('a cached static intent is followed again on a new route activation', async () => {
  mocks.queue.push(payload('/one'));
  const view = await mount();
  const intent: RouteIntentData = { status: 307, location: '/done' };
  mocks.queue.push(
    payload('/gate', Promise.resolve(JSON.stringify(intent)), true),
    payload('/done', Promise.resolve(undefined), true),
  );
  await act(async () => {
    await controls.router.push('/gate');
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    await controls.router.push('/gate');
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test('a hash-only navigation preserves the current server-render intent', async () => {
  const pending = deferIntent();
  mocks.queue.push(payload('/one', pending.promise));
  const view = await mount();
  await act(async () => {
    await controls.router.push('/one#section');
    await flush();
  });
  expect(controls.elements[INTENT_ID]).toBe(pending.promise);
  mocks.queue.push(payload('/done'));
  await act(async () => {
    pending.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
});

test('an instant navigation observes its new intent while the previous page intent stays pending', async () => {
  const previous = deferIntent();
  const incoming = deferIntent();
  mocks.queue.push({
    ...payload('/one', previous.promise),
    [getRouteSlotId('/gate')]: <p>Page /gate</p>,
    [ETAGS_ID]: { root: 1, [getRouteSlotId('/gate')]: 1 },
  });
  const view = await mount();
  mocks.queue.push(payload('/gate', incoming.promise), payload('/done'));
  await act(async () => {
    await controls.router.push('/gate', { unstable_instant: true });
    await flush();
  });
  expect(window.location.pathname).toBe('/gate');
  await act(async () => {
    incoming.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(window.location.pathname).toBe('/done');
  expect(view.textContent).toContain('Page /done');
});

test('an intent redirect preserves scroll: false through its follow', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  mocks.queue.push(payload('/one'));
  const view = await mount();
  const intent = deferIntent();
  mocks.queue.push(payload('/gate', intent.promise), payload('/done'));
  await act(async () => {
    await controls.router.push('/gate', { scroll: false });
    await flush();
    intent.resolve({ status: 307, location: '/done' });
    await flush();
  });
  expect(view.textContent).toContain('Page /done');
  expect(window.location.pathname).toBe('/done');
  expect(scroll).not.toHaveBeenCalled();
});

test.each([false, true])(
  'a late intent redirect replaces one requested history entry (instant: %s)',
  async (instant) => {
    mocks.queue.push({
      ...payload('/one'),
      [getRouteSlotId('/gate')]: <p>Cached gate</p>,
      [ETAGS_ID]: { root: 1, [getRouteSlotId('/gate')]: 1 },
    });
    const view = await mount();
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    const intent = deferIntent();
    mocks.queue.push(payload('/gate', intent.promise), payload('/done'));
    await act(async () => {
      await controls.router.push('/gate', { unstable_instant: instant });
      await flush();
    });
    expect(window.location.pathname).toBe('/gate');
    await act(async () => {
      intent.resolve({ status: 307, location: '/done' });
      await flush();
    });
    expect(view.textContent).toContain('Page /done');
    expect(window.location.pathname).toBe('/done');
    expect(push).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  },
);

test('an absolute intent leaves once without fetching its destination', async () => {
  const leave = vi
    .spyOn(window.location, 'replace')
    .mockImplementation(() => {});
  const intent = deferIntent();
  mocks.queue.push(payload('/one', intent.promise));
  await mount();
  const requests = vi.mocked(fetch).mock.calls.length;
  await act(async () => {
    intent.resolve({
      status: 307,
      location: window.location.origin + '/api/logout',
    });
    await flush();
  });
  expect(leave).toHaveBeenCalledExactlyOnceWith(
    window.location.origin + '/api/logout',
  );
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
});

test.each([false, true])(
  'an HTTP 404 renders the custom page at the requested URL (instant: %s)',
  async (instant) => {
    mocks.queue.push({
      ...payload('/one'),
      [HAS404_ID]: true,
      [getRouteSlotId('/missing')]: <p>Cached shell /missing</p>,
      [ETAGS_ID]: { root: 1, [getRouteSlotId('/missing')]: 1 },
    });
    const view = await mount();
    const push = vi.spyOn(window.history, 'pushState');
    mocks.queue.push(payload('/missing'), payload('/404'));
    const response = defer<Response>();
    vi.mocked(fetch).mockReturnValueOnce(response.promise);
    let pushed!: Promise<void>;
    await act(async () => {
      pushed = controls.router.push('/missing?q=one#section', {
        unstable_instant: instant,
      });
      await flush();
    });
    await act(async () => {
      response.resolve(new Response('missing static file', { status: 404 }));
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('Page /404');
    expect(view.textContent).not.toContain('Cached shell /missing');
    expect(
      window.location.pathname + window.location.search + window.location.hash,
    ).toBe('/missing?q=one#section');
    expect(push).toHaveBeenCalledOnce();
  },
);

test('an instant HTTP 404 follow replaces the painted history entry on a server rewrite', async () => {
  mocks.queue.push({
    ...payload('/one'),
    [HAS404_ID]: true,
    [getRouteSlotId('/missing')]: <p>Cached shell /missing</p>,
    [ETAGS_ID]: { root: 1, [getRouteSlotId('/missing')]: 1 },
  });
  const view = await mount();
  const push = vi.spyOn(window.history, 'pushState');
  const replace = vi.spyOn(window.history, 'replaceState');
  mocks.queue.push(payload('/missing'), payload('/recovered'));
  const response = defer<Response>();
  vi.mocked(fetch).mockReturnValueOnce(response.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.router.push('/missing', { unstable_instant: true });
    await flush();
  });
  expect(view.textContent).toContain('Cached shell /missing');
  expect(window.location.pathname).toBe('/missing');
  await act(async () => {
    response.resolve(new Response('missing static file', { status: 404 }));
    await pushed;
    await flush();
  });
  expect(view.textContent).toContain('Page /recovered');
  expect(window.location.pathname).toBe('/recovered');
  expect(push).toHaveBeenCalledOnce();
  expect(replace).toHaveBeenCalledOnce();
});
