// @vitest-environment happy-dom

import { Suspense, act, startTransition, use, useLayoutEffect } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ETAGS_HEADER } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc } from '../src/minimal/client-runtime.js';
import { clearInitialRscEntries } from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { unstable_createCustomError as createCustomError } from '../src/minimal/server.js';
import * as loader from '../src/router/client-core-utils/load.js';
import {
  ErrorBoundary,
  Router,
  Slice,
  useRouter,
} from '../src/router/client.js';
import {
  ACTION_LOCATION_HEADER,
  HAS404_ID,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';

type Elements = Record<string | symbol, unknown>;

const mocks = vi.hoisted(() => ({
  queue: [] as Array<Elements | Promise<Elements>>,
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: (response: Promise<Response>) => {
      const data = mocks.queue.shift();
      if (!data) {
        throw new Error('Unexpected RSC request');
      }
      return response.then(() => data);
    },
    encodeReply: async () => '',
    createTemporaryReferenceSet: () => new Map(),
  },
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

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const controls = new Map<
  string,
  {
    router: ReturnType<typeof useRouter>;
    merge: ReturnType<typeof useMergeElements>;
  }
>();
let root: ReturnType<typeof createRoot> | undefined;

const Probe = ({ id }: { id: string }) => {
  const router = useRouter();
  const merge = useMergeElements();
  const elements = use(useElementsPromise());
  useLayoutEffect(() => {
    controls.set(id, { router, merge });
  });
  return (
    <>
      <output data-route={id}>{router.path}</output>
      <output data-sidebar={id}>{String(elements.sidebar ?? '')}</output>
    </>
  );
};

const StaticStatus = () => {
  const elements = use(useElementsPromise());
  return <output data-static>{String(elements[IS_STATIC_ID])}</output>;
};

const payload = (path: string, body: ReactNode, id = 'a'): Elements => ({
  root: (
    <>
      <Probe id={id} />
      <Children />
    </>
  ),
  [ROUTE_ID]: [path, ''],
  [IS_STATIC_ID]: false,
  [getRouteSlotId(path)]: body,
});

const mount = async (children: ReactNode) => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <Suspense fallback={<p>outer fallback</p>}>{children}</Suspense>,
    );
    await flush();
  });
  return container;
};

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  window.history.replaceState({}, '', '/one');
  clearInitialRscEntries();
  mocks.queue = [];
  controls.clear();
  vi.stubGlobal('fetch', async () => new Response('{}'));
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

test('client suspension and urgent unrelated merges do not advance the route', async () => {
  const push = vi.spyOn(window.history, 'pushState');
  const ready = defer<void>();
  const Page = () => {
    use(ready.promise);
    return <p>page two</p>;
  };
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname).toBe('/one');
  await act(async () => {
    await controls.get('a')!.merge({ sidebar: 'updated' });
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.querySelector('output')?.textContent).toBe('/one');
  expect(window.location.pathname).toBe('/one');
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.textContent).toContain('page two');
  expect(view.querySelector('output')?.textContent).toBe('/two');
  expect(window.location.pathname).toBe('/two');
  expect(view.querySelector('[data-sidebar]')?.textContent).toBe('updated');
  expect(push).toHaveBeenCalledTimes(1);
});

test('normal navigation queues its pending elements before the response arrives', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const settings = defer<Elements>();
  mocks.queue.push(settings.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/settings');
      await flush();
    });
    const inspect = vi.fn((prev: Promise<Elements>) => prev);
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({}, inspect);
      });
      await flush();
    });
    const queued = inspect.mock.calls.at(-1)![0];
    expect(
      await Promise.race([
        queued.then(() => 'settled'),
        flush().then(() => 'pending'),
      ]),
    ).toBe('pending');
    expect(view.textContent).toContain('page one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      settings.resolve(payload('/settings', <p>settings</p>));
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('settings');
    expect(window.location.pathname).toBe('/settings');
  } finally {
    await act(async () => {
      settings.resolve(payload('/settings', <p>settings</p>));
      await pushed;
      await flush();
    });
  }
});

test('cancelled pending responses unblock the queue and cannot replace the destination later', async () => {
  const first = defer<Elements>();
  const second = defer<Elements>();
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(first.promise, second.promise);
  let cancelled: Promise<void> | undefined;
  let pushed: Promise<void> | undefined;
  await act(async () => {
    cancelled = controls.get('a')!.router.push('/two');
    await flush();
  });
  await act(async () => {
    pushed = controls.get('a')!.router.push('/three');
    await cancelled;
    await flush();
  });
  await act(async () => {
    second.resolve({
      ...payload('/three', <p>page three</p>),
      sidebar: 'three',
    });
    await pushed;
    await flush();
  });
  expect(view.textContent).toContain('page three');
  expect(window.location.pathname).toBe('/three');
  await act(async () => {
    first.resolve({ ...payload('/two', <p>late page two</p>), sidebar: 'two' });
    await flush();
  });
  expect(view.textContent).not.toContain('late page two');
  expect(view.querySelector('[data-sidebar]')?.textContent).toBe('three');
  expect(window.location.pathname).toBe('/three');
});

test('a resolved response keeps streaming when another navigation starts before it paints', async () => {
  const ready = defer<void>();
  const next = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>streamed page two</p>;
  };
  const fetch = vi.spyOn(globalThis, 'fetch');
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  const signal = fetch.mock.lastCall![1]?.signal;
  expect(view.textContent).toContain('page one');
  mocks.queue.push(next.promise);
  let pushed: Promise<void> | undefined;
  await act(async () => {
    pushed = controls.get('a')!.router.push('/three');
    await flush();
  });
  expect(signal?.aborted).toBe(false);
  await act(async () => {
    next.resolve(payload('/three', <p>page three</p>));
    await pushed;
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.textContent).toContain('page three');
  expect(view.textContent).not.toContain('streamed page two');
  expect(window.location.pathname).toBe('/three');
  expect(signal?.aborted).toBe(false);
});

test('partial actions survive the pending normal-navigation queue', async () => {
  mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar: 'before' });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    mocks.queue.push({ sidebar: 'action', _value: 'updated' });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/two', <p>page two</p>),
        sidebar: 'navigation',
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each([0, null])(
  'a fresh %s slot replaces an earlier queued client write',
  async (sidebar) => {
    mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({ ...payload('/two', <p>page two</p>), sidebar });
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({ sidebar: 1 });
      });
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
      String(sidebar ?? ''),
    );
  },
);

test('an origin action cannot restore route metadata over a reload rewrite', async () => {
  const Destination = () => {
    const elements = use(useElementsPromise());
    return (
      <p
        data-static={String(elements[IS_STATIC_ID])}
        data-has404={String(elements[HAS404_ID])}
      >
        rewritten page
      </p>
    );
  };
  mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar: 'before' });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let reloaded: Promise<void> | undefined;
  try {
    await act(async () => {
      reloaded = controls.get('a')!.router.reload();
      await flush();
    });
    mocks.queue.push({
      ...payload('/one', <p>origin action page</p>),
      [HAS404_ID]: true,
      [IS_ORIGIN_ID]: true,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/two', <Destination />),
        [IS_STATIC_ID]: true,
        [HAS404_ID]: false,
        _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
      });
      await reloaded;
      await flush();
    });
    expect(view.textContent).toContain('rewritten page');
    expect(view.textContent).not.toContain('origin action page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(
      view.querySelector('[data-static]')?.getAttribute('data-static'),
    ).toBe('true');
    expect(
      view.querySelector('[data-has404]')?.getAttribute('data-has404'),
    ).toBe('false');
    expect(controls.get('a')!.router.path).toBe('/two');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await reloaded;
      await flush();
    });
  }
});

test('an origin action cannot undo a reload redirect to a reused static route', async () => {
  window.history.replaceState({}, '', '/cached');
  mocks.queue.push({
    ...payload('/cached', <p>cached page</p>),
    [IS_STATIC_ID]: true,
    _etags: { root: 1, [getRouteSlotId('/cached')]: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/cached', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/one', <p>page one</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/one');
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(window.location.pathname).toBe('/one');
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let reloaded: Promise<void> | undefined;
  try {
    await act(async () => {
      reloaded = controls.get('a')!.router.reload();
      await flush();
    });
    mocks.queue.push({
      ...payload('/one', <p>origin action page</p>),
      [IS_ORIGIN_ID]: true,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.reject(createCustomError('moved', { location: '/cached' }));
      await reloaded;
      await flush();
    });
    expect(view.textContent).toContain('cached page');
    expect(view.textContent).not.toContain('origin action page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(controls.get('a')!.router.path).toBe('/cached');
    expect(window.location.pathname).toBe('/cached');
  } finally {
    await act(async () => {
      response.resolve({});
      await reloaded;
      await flush();
    });
  }
});

test.each(['two', 'before'])(
  'a later response replaces an earlier queued client value (value: %s)',
  async (value) => {
    const ready = defer<void>();
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      sidebar: 'before',
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({ ...payload('/two', <Page />), sidebar: 'two' });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      mocks.queue.push({
        ...payload('/three', <p>page three</p>),
        sidebar: 'three',
      });
      let pushed: Promise<void> | undefined;
      await act(async () => {
        startTransition(() => {
          void controls.get('a')!.merge({ sidebar: value });
          pushed = controls.get('a')!.router.push('/three');
        });
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe('three');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        ready.resolve();
        await flush();
      });
    }
  },
);

test('a cached replacement keeps its route over queued origin-action metadata', async () => {
  window.history.replaceState({}, '', '/cached');
  mocks.queue.push({
    ...payload('/cached', <p>cached page</p>),
    [IS_STATIC_ID]: true,
    _etags: { root: 1, [getRouteSlotId('/cached')]: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/cached', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/one', <p>page one</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/one');
    await flush();
  });
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let reloaded: Promise<void> | undefined;
  try {
    await act(async () => {
      reloaded = controls.get('a')!.router.reload();
      await flush();
    });
    mocks.queue.push({
      ...payload('/one', <p>origin action page</p>),
      [IS_ORIGIN_ID]: true,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      await controls.get('a')!.router.push('/cached');
      await reloaded;
      await flush();
    });
    expect(view.textContent).toContain('cached page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(window.location.pathname).toBe('/cached');
  } finally {
    await act(async () => {
      response.resolve({});
      await reloaded;
      await flush();
    });
  }
});

test.each(['before', 'after'] as const)(
  'client merges follow queue order around a later navigation (merge: %s)',
  async (order) => {
    const ready = defer<void>();
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    mocks.queue.push({ ...payload('/one', <p>page one</p>), sidebar: 0 });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({ ...payload('/two', <Page />), sidebar: 1 });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      const response = defer<Elements>();
      mocks.queue.push(response.promise);
      let pushed: Promise<void> | undefined;
      await act(async () => {
        startTransition(() => {
          if (order === 'after') {
            pushed = controls.get('a')!.router.push('/three');
          }
          void controls.get('a')!.merge({}, (prev) =>
            prev.then((elements) =>
              combineElements(elements, {
                sidebar: Number(elements.sidebar) + 1,
              }),
            ),
          );
          if (order === 'before') {
            pushed = controls.get('a')!.router.push('/three');
          }
        });
        await flush();
      });
      await act(async () => {
        response.resolve({
          ...payload('/three', <p>page three</p>),
          sidebar: 10,
        });
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        order === 'after' ? '11' : '10',
      );
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        ready.resolve();
        await flush();
      });
    }
  },
);

test('a lazy slice settling during normal navigation keeps the shell visible', async () => {
  const fallbackMounted = vi.fn();
  const Fallback = () => {
    useLayoutEffect(fallbackMounted, []);
    return <p>outer fallback</p>;
  };
  const slice = defer<Elements>();
  const response = defer<Elements>();
  mocks.queue.push(
    {
      ...payload('/one', <p>page one</p>),
      root: (
        <>
          <Probe id="a" />
          <Slice id="aside" lazy fallback={<p>slice fallback</p>} />
          <Children />
        </>
      ),
      _etags: { root: 1 },
    },
    slice.promise,
  );
  const view = await mount(
    <Suspense fallback={<Fallback />}>
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />
    </Suspense>,
  );
  fallbackMounted.mockClear();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({ sidebar: 'client' });
      });
      await flush();
    });
    expect(fallbackMounted).not.toHaveBeenCalled();
    await act(async () => {
      slice.resolve({
        'slice:aside': <aside>loaded slice</aside>,
        _etags: { 'slice:aside': 1 },
      });
      await flush();
    });
    expect(fallbackMounted).not.toHaveBeenCalled();
    expect(view.textContent).toContain('page one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/two')]: <p>page two</p>,
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.textContent).toContain('loaded slice');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
    expect(fallbackMounted).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      slice.resolve({});
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test('a replacement preserves client updates queued before it starts', async () => {
  const state = Symbol('client state');
  const ClientState = () => {
    const elements = use(useElementsPromise());
    return <output data-client-state>{String(elements[state] ?? '')}</output>;
  };
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <ClientState />
        <Children />
      </>
    ),
    sidebar: 'before',
    _etags: { root: 1, sidebar: 'v1' },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  await act(async () => {
    await controls.get('a')!.merge({ [state]: 'before' });
    await flush();
  });
  const first = defer<Elements>();
  const second = defer<Elements>();
  mocks.queue.push(first.promise, second.promise);
  let pushed: Promise<void> | undefined;
  let replacement: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two');
      await flush();
    });
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({ sidebar: 'client', [state]: 'client' });
        replacement = controls.get('a')!.router.push('/three');
      });
      await flush();
    });
    await act(async () => {
      second.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
      });
      await replacement;
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
    expect(view.querySelector('[data-client-state]')?.textContent).toBe(
      'client',
    );
    expect(window.location.pathname).toBe('/three');
  } finally {
    await act(async () => {
      first.resolve({});
      second.resolve({});
      await Promise.all([pushed, replacement]);
      await flush();
    });
  }
});

test.each(['none', 'client', 'action'] as const)(
  'a later response updates existing slots and validators (earlier write: %s)',
  async (write) => {
    const ready = defer<void>();
    const replacement = defer<Elements>();
    let pushed: Promise<void> | undefined;
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', <Page />),
      sidebar: 'two',
      _etags: { sidebar: 'two-v1' },
    });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      expect(view.textContent).toContain('page one');
      if (write === 'action') {
        mocks.queue.push({
          sidebar: 'two',
          _etags: { sidebar: 'two-v1' },
          _value: 'updated',
        });
        await act(async () => {
          expect(await unstable_callServerRsc('actions#update', [])).toBe(
            'updated',
          );
          await flush();
        });
      }
      mocks.queue.push(replacement.promise);
      await act(async () => {
        startTransition(() => {
          if (write === 'client') {
            void controls.get('a')!.merge({ sidebar: 'client' });
          }
          pushed = controls.get('a')!.router.push('/three');
        });
        await flush();
      });
      await act(async () => {
        replacement.resolve({
          ...payload('/three', <p>page three</p>),
          sidebar: 'three',
          _etags: { sidebar: 'three-v1' },
        });
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe('three');
      expect(window.location.pathname).toBe('/three');
      mocks.queue.push(payload('/three', <p>page three</p>));
      await act(async () => {
        await controls.get('a')!.router.reload();
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(JSON.parse(headers.get(ETAGS_HEADER) ?? '{}').sidebar).toBe(
        'three-v1',
      );
    } finally {
      await act(async () => {
        ready.resolve();
        replacement.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test.each([
  ['client', 'client', undefined],
  ['action', 'two', 'two-v1'],
  ['baseline-action', 'before', 'action-v2'],
  ['remove', '', undefined],
] as const)(
  'retained baseline slots preserve independent queued changes (write: %s)',
  async (write, expectedSidebar, expectedEtag) => {
    const state = Symbol('client state');
    const ClientState = () => {
      const elements = use(useElementsPromise());
      return (
        <output
          data-client-state
          data-sidebar-present={Object.hasOwn(elements, 'sidebar')}
        >
          {Object.hasOwn(elements, state) ? String(elements[state]) : 'absent'}
        </output>
      );
    };
    const ready = defer<void>();
    const replacement = defer<Elements>();
    let pushed: Promise<void> | undefined;
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: (
        <>
          <Probe id="a" />
          <ClientState />
          <Children />
        </>
      ),
      sidebar: 'before',
      _etags: { root: 1, sidebar: 'before-v1' },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    await act(async () => {
      await controls.get('a')!.merge({ [state]: 'before' });
      await flush();
    });
    mocks.queue.push({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/two')]: <Page />,
      sidebar: 'two',
      _etags: { sidebar: 'two-v1' },
    });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      if (write === 'action' || write === 'baseline-action') {
        mocks.queue.push({
          sidebar: expectedSidebar,
          _etags: { sidebar: expectedEtag },
          _value: 'updated',
        });
        await act(async () => {
          expect(await unstable_callServerRsc('actions#update', [])).toBe(
            'updated',
          );
          await flush();
        });
      }
      mocks.queue.push(replacement.promise);
      await act(async () => {
        startTransition(() => {
          if (write === 'remove') {
            void controls.get('a')!.merge({}, (prev) =>
              prev.then((elements) =>
                combineElements({}, elements, {
                  filter: (key) => key !== 'sidebar' && key !== state,
                }),
              ),
            );
          } else {
            void controls.get('a')!.merge({
              ...(write === 'client' ? { sidebar: 'client' } : {}),
              [state]: 'client',
            });
          }
          pushed = controls.get('a')!.router.push('/three');
        });
        await flush();
      });
      await act(async () => {
        replacement.resolve({
          [ROUTE_ID]: ['/three', ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId('/three')]: <p>page three</p>,
        });
        await pushed;
        ready.resolve();
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        expectedSidebar,
      );
      expect(view.querySelector('[data-client-state]')?.textContent).toBe(
        write === 'remove' ? 'absent' : 'client',
      );
      expect(
        view
          .querySelector('[data-sidebar-present]')
          ?.getAttribute('data-sidebar-present'),
      ).toBe(String(write !== 'remove'));
      expect(window.location.pathname).toBe('/three');
      mocks.queue.push({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
        sidebar: 'reloaded',
        _etags: { sidebar: 'reload-v1' },
      });
      await act(async () => {
        await controls.get('a')!.router.reload();
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(JSON.parse(headers.get(ETAGS_HEADER) ?? '{}').sidebar).toBe(
        expectedEtag,
      );
    } finally {
      await act(async () => {
        ready.resolve();
        replacement.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test('a retained baseline does not restore a removal omitted by the prefetched response', async () => {
  const ready = defer<void>();
  const replacement = defer<Elements>();
  let pushed: Promise<void> | undefined;
  const Page = () => {
    use(ready.promise);
    return <p>superseded page</p>;
  };
  const initial: Elements = {
    ...payload('/one', <p>page one</p>),
    sidebar: 'before',
    _etags: { root: 1, sidebar: 'before-v1' },
  };
  mocks.queue.push(initial);
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    root: initial.root,
    [ROUTE_ID]: ['/two', ''],
    [IS_STATIC_ID]: false,
    [getRouteSlotId('/two')]: <Page />,
    _etags: { root: 1 },
  });
  try {
    await act(async () => {
      controls.get('a')!.router.prefetch('/two');
      await flush();
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    mocks.queue.push(replacement.promise);
    await act(async () => {
      startTransition(() => {
        void controls.get('a')!.merge({}, (prev) =>
          prev.then((elements) =>
            combineElements({}, elements, {
              filter: (key) => key !== 'sidebar',
            }),
          ),
        );
        pushed = controls.get('a')!.router.push('/three');
      });
      await flush();
    });
    await act(async () => {
      replacement.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
      });
      await pushed;
      ready.resolve();
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('');
    expect(window.location.pathname).toBe('/three');
  } finally {
    await act(async () => {
      ready.resolve();
      replacement.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each(['pending', 'failed'] as const)(
  'a later response replaces earlier slots across a %s intermediate request',
  async (intermediate) => {
    const ready = defer<void>();
    const middle = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>superseded page</p>;
    };
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({ ...payload('/two', <Page />), sidebar: 'two' });
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      mocks.queue.push(middle.promise);
      await act(async () => {
        pushed = controls.get('a')!.router.push('/middle');
        void pushed.catch(() => {});
        await flush();
      });
      mocks.queue.push({
        ...payload('/three', <p>page three</p>),
        sidebar: 'three',
      });
      await act(async () => {
        if (intermediate === 'failed') {
          middle.reject(new Error('offline'));
          await expect(pushed).rejects.toThrow('offline');
        }
        await controls.get('a')!.router.push('/three');
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe('three');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        ready.resolve();
        middle.resolve({});
        await pushed?.catch(() => {});
        await flush();
      });
    }
  },
);

test('a query navigation preserves action data without taking its old composition', async () => {
  mocks.queue.push({
    ...payload('/one', <p>initial page</p>),
    sidebar: 'before',
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const response = defer<Elements>();
  mocks.queue.push(response.promise);
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/one?q=next');
      await flush();
    });
    mocks.queue.push({
      [getRouteSlotId('/one')]: <p>old query action page</p>,
      sidebar: 'action',
      _value: 'updated',
    });
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      await flush();
    });
    await act(async () => {
      response.resolve({
        ...payload('/one', <p>destination page</p>),
        [ROUTE_ID]: ['/one', 'q=next'],
        sidebar: 'navigation',
      });
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain('destination page');
    expect(view.textContent).not.toContain('old query action page');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('action');
    expect(controls.get('a')!.router.query).toBe('q=next');
    expect(window.location.search).toBe('?q=next');
  } finally {
    await act(async () => {
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each([false, true])(
  'an instant response is adopted once, while a redirect follow commits its destination (redirect: %s)',
  async (redirect) => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    const push = vi.spyOn(window.history, 'pushState');
    const replace = vi.spyOn(window.history, 'replaceState');
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      [getRouteSlotId('/two')]: <p>cached page two</p>,
      _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    const response = defer<Elements>();
    mocks.queue.push(response.promise);
    if (redirect) {
      mocks.queue.push(payload('/three', <p>followed page three</p>));
    }
    let pushed!: Promise<void>;
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two', {
        unstable_instant: true,
      });
      await flush();
    });
    expect(view.textContent).toContain('cached page two');
    expect(view.querySelector('output')?.textContent).toBe('/two');
    expect(window.location.pathname).toBe('/two');
    expect(push).toHaveBeenCalledTimes(1);
    expect(scroll).toHaveBeenCalledTimes(1);
    await act(async () => {
      if (redirect) {
        response.reject(createCustomError('moved', { location: '/three' }));
      } else {
        response.resolve({ [ROUTE_ID]: ['/two', ''], sidebar: 'response' });
      }
      await pushed;
      await flush();
    });
    expect(view.textContent).toContain(
      redirect ? 'followed page three' : 'cached page two',
    );
    expect(view.querySelector('output')?.textContent).toBe(
      redirect ? '/three' : '/two',
    );
    expect(window.location.pathname).toBe(redirect ? '/three' : '/two');
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledTimes(redirect ? 1 : 0);
    expect(scroll).toHaveBeenCalledTimes(redirect ? 2 : 1);
    if (!redirect) {
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        'response',
      );
    }
    expect(mocks.queue).toEqual([]);
  },
);

test.each([
  {
    name: 'same-route return',
    to: '/one#anchor',
    intermediate: 'none',
    redirect: false,
  },
  {
    name: 'fetched destination',
    to: '/three',
    intermediate: 'none',
    redirect: false,
  },
  {
    name: 'cancelled intermediate request',
    to: '/three',
    intermediate: 'cancelled',
    redirect: false,
  },
  {
    name: 'failed intermediate request',
    to: '/one#anchor',
    intermediate: 'failed',
    redirect: false,
  },
  {
    name: 'hash-only redirect',
    to: '/one#anchor',
    intermediate: 'none',
    redirect: true,
  },
])(
  'a later destination uses the accepted layout baseline ($name)',
  async ({ to, intermediate, redirect }) => {
    const ready = defer<void>();
    const pending = defer<Elements>();
    const response = defer<Elements>();
    const redirected = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    const first = {
      ...payload('/one', <p>page one</p>),
      root: (
        <>
          <Probe id="a" />
          <aside>layout one</aside>
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      _etags: { root: 'one-v1' },
    };
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push(first);
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', <Page />),
      root: (
        <>
          <Probe id="a" />
          <aside>layout two</aside>
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      _etags: { root: 'two-v1' },
    });
    let superseded: Promise<void> | undefined;
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      expect(window.location.pathname).toBe('/one');
      if (intermediate !== 'none') {
        mocks.queue.push(pending.promise);
        await act(async () => {
          superseded = controls.get('a')!.router.push('/pending');
          void superseded.catch(() => {});
          await flush();
        });
      }
      mocks.queue.push(
        ...(redirect ? [redirected.promise] : []),
        response.promise,
      );
      await act(async () => {
        if (intermediate === 'failed') {
          pending.reject(new Error('offline'));
          await expect(superseded).rejects.toThrow('offline');
        }
        pushed = controls.get('a')!.router.push(to);
        await flush();
      });
      if (redirect) {
        await act(async () => {
          redirected.reject(
            createCustomError('moved', { location: '/one#redirected' }),
          );
          await flush();
        });
      }
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
      const path = new URL(to, window.location.href).pathname;
      await act(async () => {
        response.resolve({
          [ROUTE_ID]: [path, ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId(path)]: <p>destination page</p>,
          ...(etags.root === 'one-v1'
            ? {}
            : { root: first.root, _etags: { root: 'one-v1' } }),
        });
        await pushed;
        await superseded?.catch(() => {});
        ready.resolve();
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      expect(view.textContent).not.toContain('page two');
      expect(window.location.pathname + window.location.hash).toBe(
        redirect ? '/one#redirected' : to,
      );
      expect(etags.root).toBe('two-v1');
      expect(view.textContent).toContain('destination page');
    } finally {
      await act(async () => {
        ready.resolve();
        pending.resolve({});
        response.resolve({});
        redirected.resolve({});
        await pushed;
        await superseded?.catch(() => {});
        await flush();
      });
    }
  },
);

test.each([false, true])(
  'a chained navigation uses the accepted instant layout baseline (prefetched: %s)',
  async (prefetched) => {
    const ready = defer<void>();
    const response = defer<Elements>();
    const next = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    const renderLayout = (name: string) => (
      <>
        <Probe id="a" />
        <aside>{name}</aside>
        <Children />
      </>
    );
    const firstRoot = renderLayout('layout one');
    const cachedPage = <Page />;
    const instantElements = {
      ...payload('/two', cachedPage),
      root: renderLayout('layout two'),
      _etags: { root: 'two-v1', [getRouteSlotId('/two')]: 1 },
    };
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: firstRoot,
      ...(prefetched ? {} : { [getRouteSlotId('/two')]: cachedPage }),
      _etags: {
        root: 'one-v1',
        ...(prefetched ? {} : { [getRouteSlotId('/two')]: 1 }),
      },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    if (prefetched) {
      mocks.queue.push({
        ...instantElements,
        [ROUTE_ID]: ['/two', 'q=cached'],
      });
      await act(async () => {
        controls.get('a')!.router.prefetch('/two?q=cached');
        await flush();
      });
    }
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push(response.promise, next.promise);
    let instantNavigation: Promise<void> | undefined;
    let navigation: Promise<void> | undefined;
    try {
      await act(async () => {
        instantNavigation = controls.get('a')!.router.push('/two?q=live', {
          unstable_instant: true,
        });
        await flush();
      });
      await act(async () => {
        response.resolve({
          ...(prefetched ? {} : instantElements),
          [ROUTE_ID]: ['/two', 'q=live'],
          [IS_STATIC_ID]: false,
        });
        await instantNavigation;
        navigation = controls.get('a')!.router.push('/three');
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
      await act(async () => {
        next.resolve({
          [ROUTE_ID]: ['/three', ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId('/three')]: <p>page three</p>,
          ...(etags.root === 'one-v1'
            ? {}
            : { root: firstRoot, _etags: { root: 'one-v1' } }),
        });
        await navigation;
        ready.resolve();
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      expect(view.textContent).toContain('page three');
      expect(window.location.pathname).toBe('/three');
      expect(etags.root).not.toBe('one-v1');
    } finally {
      await act(async () => {
        ready.resolve();
        response.resolve({});
        next.resolve({});
        await instantNavigation;
        await navigation;
        await flush();
      });
    }
  },
);

test('accepting an instant response does not replay its slots over queued client updates', async () => {
  const response = defer<Elements>();
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    [getRouteSlotId('/two')]: <p>page two</p>,
    sidebar: 'before',
    _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(response.promise);
  let navigation: Promise<void> | undefined;
  try {
    await act(async () => {
      navigation = controls.get('a')!.router.push('/two', {
        unstable_instant: true,
      });
      await flush();
    });
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
        sidebar: 'response',
      });
      await controls.get('a')!.merge({ sidebar: 'client' });
      await navigation;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await navigation;
      await flush();
    });
  }
});

test('an adopted instant response applies metadata after an unrelated update', async () => {
  const response = defer<Elements>();
  const state = Symbol('client state');
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <StaticStatus />
        <Children />
      </>
    ),
    [IS_STATIC_ID]: true,
    [getRouteSlotId('/two')]: <p>page two</p>,
    _etags: {
      root: 1,
      [getRouteSlotId('/one')]: 1,
      [getRouteSlotId('/two')]: 1,
    },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(response.promise);
  let navigation: Promise<void> | undefined;
  try {
    await act(async () => {
      navigation = controls.get('a')!.router.push('/two', {
        unstable_instant: true,
      });
      await flush();
    });
    await act(async () => {
      await controls.get('a')!.merge({ [state]: 'client' });
      await flush();
    });
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/two', ''],
        [IS_STATIC_ID]: false,
        banner: 'dynamic banner',
      });
      await navigation;
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-static]')?.textContent).toBe('false');
    expect(window.location.pathname).toBe('/two');
  } finally {
    await act(async () => {
      response.resolve({});
      await navigation;
      await flush();
    });
  }
});

test.each([false, true])(
  'an adopted instant response cannot claim unmerged slots (static redirect: %s)',
  async (staticRedirect) => {
    const ready = defer<void>();
    const response = defer<Elements>();
    const next = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    const destination = (
      <>
        <p>page three</p>
        <aside data-banner>
          <Slot id="banner" />
        </aside>
      </>
    );
    const bannerEtag = staticRedirect ? 1 : 'banner-v1';
    const sharedRoot = (
      <>
        <Probe id="a" />
        <ErrorBoundary>
          <Children />
        </ErrorBoundary>
      </>
    );
    const cachedPage = <Page />;
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: sharedRoot,
      [getRouteSlotId('/two')]: cachedPage,
      _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    const fetch = vi.spyOn(globalThis, 'fetch');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.queue.push(response.promise, next.promise);
    let instantNavigation: Promise<void> | undefined;
    let navigation: Promise<void> | undefined;
    try {
      await act(async () => {
        instantNavigation = controls.get('a')!.router.push('/two', {
          unstable_instant: true,
        });
        await flush();
      });
      await act(async () => {
        startTransition(() => {
          void controls.get('a')!.merge({ sidebar: 'client' });
        });
        await flush();
      });
      await act(async () => {
        response.resolve({
          [ROUTE_ID]: [staticRedirect ? '/three' : '/two', ''],
          [IS_STATIC_ID]: staticRedirect,
          root: sharedRoot,
          [getRouteSlotId(staticRedirect ? '/three' : '/two')]: staticRedirect
            ? destination
            : cachedPage,
          banner: 'banner from two',
          _etags: {
            root: 1,
            banner: bannerEtag,
            [getRouteSlotId(staticRedirect ? '/three' : '/two')]: 1,
          },
        });
        await instantNavigation;
        navigation = controls.get('a')!.router.push('/three');
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
      await act(async () => {
        next.resolve({
          [ROUTE_ID]: ['/three', ''],
          [IS_STATIC_ID]: staticRedirect,
          root: sharedRoot,
          [getRouteSlotId('/three')]: destination,
          ...(etags.banner === bannerEtag ? {} : { banner: 'banner from two' }),
          _etags: {
            root: 1,
            ...(staticRedirect ? { [getRouteSlotId('/three')]: 1 } : {}),
            ...(etags.banner === bannerEtag ? {} : { banner: bannerEtag }),
          },
        });
        await navigation;
        ready.resolve();
        await flush();
      });
      expect(view.querySelector('[data-banner]')?.textContent).toBe(
        'banner from two',
      );
      expect(view.textContent).toContain('page three');
      expect(view.textContent).not.toContain('Caught an unexpected error');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        ready.resolve();
        response.resolve({});
        next.resolve({});
        await instantNavigation;
        await navigation;
        await flush();
      });
    }
  },
);

test.each([false, true])(
  'a replacement cannot retain a cancelled instant preview (transport ignores cancellation: %s)',
  async (ignoresCancellation) => {
    const response = defer<Elements>();
    const next = defer<Elements>();
    const renderPage = (name: string) => (
      <>
        <p>{name}</p>
        <Suspense fallback="waiting for banner">
          <aside data-banner>
            <Slot id="banner" />
          </aside>
        </Suspense>
      </>
    );
    const first = payload('/one', renderPage('page one'));
    mocks.queue.push({
      ...first,
      banner: 'origin banner',
      _etags: { root: 1, banner: 'origin-v1' },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', renderPage('page two')),
      root: first.root,
      [ROUTE_ID]: ['/two', 'q=cached'],
      banner: 'preview banner',
      _etags: { root: 1, [getRouteSlotId('/two')]: 1, banner: 'preview-v1' },
    });
    await act(async () => {
      controls.get('a')!.router.prefetch('/two?q=cached');
      await flush();
    });
    const fetch = vi.spyOn(globalThis, 'fetch');
    mocks.queue.push(response.promise, next.promise);
    let instantNavigation: Promise<void> | undefined;
    let navigation: Promise<void> | undefined;
    try {
      await act(async () => {
        instantNavigation = controls.get('a')!.router.push('/two?q=live', {
          unstable_instant: true,
        });
        await flush();
      });
      expect(view.textContent).toContain('page two');
      const signal = fetch.mock.lastCall![1]?.signal;
      if (!ignoresCancellation) {
        signal?.addEventListener('abort', () => {
          response.reject(new DOMException('Aborted', 'AbortError'));
        });
      }
      await act(async () => {
        navigation = controls.get('a')!.router.push('/three');
        await instantNavigation;
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
      await act(async () => {
        next.resolve({
          [ROUTE_ID]: ['/three', ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId('/three')]: renderPage('page three'),
          ...(etags.banner === 'origin-v1'
            ? {}
            : { banner: 'origin banner', _etags: { banner: 'origin-v1' } }),
        });
        await navigation;
        await flush();
      });
      expect(view.querySelector('[data-banner]')?.textContent).toBe(
        'origin banner',
      );
      expect(view.textContent).toContain('page three');
      expect(view.textContent).not.toContain('waiting for banner');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        response.resolve({});
        next.resolve({});
        await instantNavigation;
        await navigation;
        await flush();
      });
    }
  },
);

test('an instant response fills omitted slots from its prefetched base', async () => {
  const response = defer<Elements>();
  const first = payload('/one', <p>page one</p>);
  mocks.queue.push({
    ...first,
    sidebar: 'original',
    _etags: { root: 1, sidebar: 'original-v1' },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    ...payload(
      '/two',
      <>
        <p>page two</p>
        <Suspense fallback="waiting">
          <aside data-prefetched-sidebar>
            <Slot id="sidebar" />
          </aside>
        </Suspense>
      </>,
    ),
    root: first.root,
    sidebar: 'prefetched',
    [ROUTE_ID]: ['/two', 'q=cached'],
    _etags: {
      root: 1,
      [getRouteSlotId('/two')]: 1,
      sidebar: 'prefetched-v1',
    },
  });
  await act(async () => {
    controls.get('a')!.router.prefetch('/two?q=cached');
    await flush();
  });
  mocks.queue.push(response.promise);
  const fetch = vi.spyOn(globalThis, 'fetch');
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      pushed = controls.get('a')!.router.push('/two?q=live', {
        unstable_instant: true,
      });
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.textContent).toContain('waiting');
    const headers = new Headers(fetch.mock.lastCall![1]?.headers);
    const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/two', 'q=live'],
        [IS_STATIC_ID]: false,
      });
      await pushed;
      await flush();
    });
    expect(view.querySelector('[data-prefetched-sidebar]')?.textContent).toBe(
      'prefetched',
    );
    expect(view.textContent).toContain('page two');
    expect(window.location.pathname + window.location.search).toBe(
      '/two?q=live',
    );
    expect(etags.sidebar).toBe('prefetched-v1');
  } finally {
    await act(async () => {
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each(['page', 'layout'])(
  'an instant redirect uses the accepted layout baseline (suspension in %s)',
  async (suspension) => {
    const ready = defer<void>();
    const response = defer<Elements>();
    const followed = defer<Elements>();
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    const layout = (name: string) => (
      <>
        <Probe id="a" />
        <aside>{name}</aside>
        <Children />
      </>
    );
    const SuspendedLayout = () => {
      use(ready.promise);
      return layout('layout two');
    };
    const firstRoot = layout('layout one');
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: firstRoot,
      sidebar: 'baseline',
      [getRouteSlotId('/three')]: <p>cached page three</p>,
      _etags: {
        root: 'one-v1',
        sidebar: 'sidebar-v1',
        [getRouteSlotId('/three')]: 1,
      },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', suspension === 'page' ? <Page /> : <p>page two</p>),
      root:
        suspension === 'layout' ? <SuspendedLayout /> : layout('layout two'),
      _etags: { root: 'two-v1' },
    });
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      const fetch = vi.spyOn(globalThis, 'fetch');
      mocks.queue.push(response.promise, followed.promise);
      await act(async () => {
        pushed = controls.get('a')!.router.push('/three', {
          unstable_instant: true,
        });
        await flush();
      });
      await act(async () => {
        response.reject(createCustomError('moved', { location: '/four' }));
        await flush();
      });
      await act(async () => {
        startTransition(() => {
          void controls.get('a')!.merge({ sidebar: 'queued update' });
        });
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
      await act(async () => {
        followed.resolve({
          [ROUTE_ID]: ['/four', ''],
          [IS_STATIC_ID]: false,
          [getRouteSlotId('/four')]: <p>page four</p>,
          ...(etags.root === 'one-v1'
            ? {}
            : { root: firstRoot, _etags: { root: 'one-v1' } }),
        });
        await pushed;
        ready.resolve();
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      expect(view.textContent).toContain('page four');
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        'queued update',
      );
      expect(window.location.pathname).toBe('/four');
      expect(etags.root).toBe('two-v1');
    } finally {
      await act(async () => {
        ready.resolve();
        response.resolve({});
        followed.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test.each([false, true])(
  'a cached static return keeps its immutable composition after an accepted response (redirect: %s)',
  async (redirect) => {
    const ready = defer<void>();
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    const first = {
      ...payload(
        '/one',
        <>
          <aside>layout one</aside>
          <p>page one</p>
        </>,
      ),
      root: (
        <>
          <Probe id="a" />
          <StaticStatus />
          <Children />
        </>
      ),
      [IS_STATIC_ID]: true,
      _etags: { root: 1, [getRouteSlotId('/one')]: 1 },
    };
    mocks.queue.push(first);
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/two')]: (
        <>
          <aside>layout two</aside>
          <Page />
        </>
      ),
    });
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      const fetch = vi.spyOn(globalThis, 'fetch');
      await act(async () => {
        if (redirect) {
          mocks.queue.push(
            Promise.reject(
              createCustomError('moved', { location: '/one#anchor' }),
            ),
          );
        }
        await controls
          .get('a')!
          .router.push(redirect ? '/redirect' : '/one#anchor');
        ready.resolve();
        await flush();
      });
      expect(view.querySelector('aside')?.textContent).toBe('layout one');
      expect(view.textContent).toContain('page one');
      expect(window.location.pathname + window.location.hash).toBe(
        '/one#anchor',
      );
      expect(view.querySelector('[data-static]')?.textContent).toBe('true');
      expect(fetch).toHaveBeenCalledTimes(redirect ? 1 : 0);
    } finally {
      await act(async () => {
        ready.resolve();
        await flush();
      });
    }
  },
);

test('a hash-only redirect retains the accepted static classification before it paints', async () => {
  const ready = defer<void>();
  const Page = () => {
    use(ready.promise);
    return <p>page two</p>;
  };
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <StaticStatus />
        <Children />
      </>
    ),
    _etags: { root: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    [ROUTE_ID]: ['/two', ''],
    [IS_STATIC_ID]: true,
    [getRouteSlotId('/two')]: <Page />,
    _etags: { [getRouteSlotId('/two')]: 1 },
  });
  try {
    await act(async () => {
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    expect(view.textContent).toContain('page one');
    await act(async () => {
      mocks.queue.push(
        Promise.reject(
          createCustomError('moved', { location: '/two#redirected' }),
        ),
      );
      await controls.get('a')!.router.push('/two#anchor');
      ready.resolve();
      await flush();
    });
    expect(view.textContent).toContain('page two');
    expect(view.querySelector('[data-static]')?.textContent).toBe('true');
    expect(window.location.pathname + window.location.hash).toBe(
      '/two#redirected',
    );
  } finally {
    await act(async () => {
      ready.resolve();
      await flush();
    });
  }
});

test('an instant follow to a dynamic route cannot make later visits reuse stale content', async () => {
  const ready = defer<void>();
  const response = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>page two</p>;
  };
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <StaticStatus />
        <Children />
      </>
    ),
    [IS_STATIC_ID]: true,
    [getRouteSlotId('/three')]: <p>cached page three</p>,
    _etags: {
      root: 1,
      [getRouteSlotId('/one')]: 1,
      [getRouteSlotId('/three')]: 1,
    },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    [ROUTE_ID]: ['/two', ''],
    [IS_STATIC_ID]: false,
    [getRouteSlotId('/two')]: <Page />,
  });
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    expect(view.textContent).toContain('page one');
    mocks.queue.push(response.promise, {
      [ROUTE_ID]: ['/four', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/four')]: <p>page four</p>,
    });
    await act(async () => {
      pushed = controls.get('a')!.router.push('/three', {
        unstable_instant: true,
      });
      await flush();
    });
    expect(view.textContent).toContain('cached page three');
    await act(async () => {
      response.reject(createCustomError('moved', { location: '/four' }));
      await pushed;
      ready.resolve();
      await flush();
    });
    expect(view.textContent).toContain('page four');
    const staticAfterFollow = view.querySelector('[data-static]')?.textContent;
    mocks.queue.push({
      [ROUTE_ID]: ['/five', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/five')]: <p>page five</p>,
    });
    await act(async () => {
      await controls.get('a')!.router.push('/five');
      await flush();
    });
    mocks.queue.push({
      [ROUTE_ID]: ['/four', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/four')]: <p>fresh page four</p>,
    });
    await act(async () => {
      await controls.get('a')!.router.push('/four');
      await flush();
    });
    expect(view.textContent).toContain('fresh page four');
    expect(window.location.pathname).toBe('/four');
    expect(staticAfterFollow).toBe('false');
  } finally {
    await act(async () => {
      ready.resolve();
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test('an action destination does not inherit the preceding accepted layout validator', async () => {
  const ready = defer<void>();
  const response = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>page two</p>;
  };
  const layout = (name: string) => (
    <>
      <Probe id="a" />
      <aside>{name}</aside>
      <Children />
    </>
  );
  const secondRoot = layout('layout two');
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: layout('layout one'),
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push({
    ...payload('/two', <Page />),
    root: secondRoot,
    _etags: { root: 'two-v1' },
  });
  const fetch = vi.spyOn(globalThis, 'fetch');
  let pushed: Promise<void> | undefined;
  try {
    await act(async () => {
      await controls.get('a')!.router.push('/two');
      await flush();
    });
    mocks.queue.push(
      {
        ...payload('/action', <p>action page</p>),
        root: layout('action layout'),
        _etags: { root: 'action-v1' },
        _value: 'updated',
      },
      response.promise,
    );
    await act(async () => {
      expect(await unstable_callServerRsc('actions#update', [])).toBe(
        'updated',
      );
      pushed = controls.get('a')!.router.push('/three');
      await flush();
    });
    const headers = new Headers(fetch.mock.lastCall![1]?.headers);
    const etags = JSON.parse(headers.get(ETAGS_HEADER) ?? '{}');
    await act(async () => {
      response.resolve({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
        ...(etags.root === 'two-v1'
          ? {}
          : { root: secondRoot, _etags: { root: 'two-v1' } }),
      });
      await pushed;
      ready.resolve();
      await flush();
    });
    expect(view.querySelector('aside')?.textContent).toBe('layout two');
    expect(view.textContent).toContain('page three');
    expect(window.location.pathname).toBe('/three');
    expect(etags.root).not.toBe('two-v1');
  } finally {
    await act(async () => {
      ready.resolve();
      response.resolve({});
      await pushed;
      await flush();
    });
  }
});

test.each([
  { kind: 'redirect', replacement: true },
  { kind: '404', replacement: true },
  { kind: 'external', replacement: true },
  { kind: 'redirect', replacement: false },
  { kind: '404', replacement: false },
  { kind: 'external', replacement: false },
])(
  'a streamed $kind follows only its active destination (replacement: $replacement)',
  async ({ kind, replacement }) => {
    const streamed = defer<ReactNode>();
    const pending = defer<Elements>();
    const Page = () => use(streamed.promise);
    const leave = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload(
        '/two',
        <Suspense fallback={<p>streaming page two</p>}>
          <Page />
        </Suspense>,
      ),
      [HAS404_ID]: true,
    });
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      mocks.queue.push(
        ...(replacement ? [pending.promise] : []),
        payload(kind === '404' ? '/404' : '/hijacked', <p>followed page</p>),
      );
      await act(async () => {
        if (replacement) {
          pushed = controls.get('a')!.router.push('/three');
        }
        await flush();
      });
      await act(async () => {
        streamed.reject(
          createCustomError(
            'streamed failure',
            kind === '404'
              ? { status: 404 }
              : {
                  location:
                    kind === 'external'
                      ? 'https://other.example/hijacked'
                      : '/hijacked',
                },
          ),
        );
        await flush();
      });
      expect(leave).toHaveBeenCalledTimes(
        !replacement && kind === 'external' ? 1 : 0,
      );
      await act(async () => {
        pending.resolve(payload('/three', <p>page three</p>));
        await pushed;
        await flush();
      });
      if (replacement) {
        expect(window.location.pathname).toBe('/three');
        expect(view.textContent).toContain('page three');
      } else if (kind !== 'external') {
        expect(view.textContent).toContain('followed page');
      }
    } finally {
      await act(async () => {
        streamed.resolve(<p>page two</p>);
        pending.resolve(payload('/three', <p>page three</p>));
        await pushed;
        await flush();
      });
    }
  },
);

test.each(['redirect', '404', 'error'] as const)(
  'a suspended accepted page cannot block its replacement with a late %s',
  async (kind) => {
    const streamed = defer<ReactNode>();
    const pending = defer<Elements>();
    const Page = () => use(streamed.promise);
    const sharedRoot = (
      <ErrorBoundary>
        <Probe id="a" />
        <Children />
      </ErrorBoundary>
    );
    const replacement = {
      ...payload('/three', <p>page three</p>),
      root: sharedRoot,
    };
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      root: sharedRoot,
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      ...payload('/two', <Page />),
      root: sharedRoot,
      [HAS404_ID]: true,
    });
    let pushed: Promise<void> | undefined;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      expect(view.textContent).toContain('page one');
      mocks.queue.push(
        pending.promise,
        payload(kind === '404' ? '/404' : '/hijacked', <p>followed page</p>),
      );
      await act(async () => {
        pushed = controls.get('a')!.router.push('/three');
        await flush();
      });
      const fetch = vi.spyOn(globalThis, 'fetch');
      await act(async () => {
        streamed.reject(
          kind === 'error'
            ? new Error('obsolete render error')
            : createCustomError(
                'obsolete follow',
                kind === '404' ? { status: 404 } : { location: '/hijacked' },
              ),
        );
        await flush();
      });
      expect(fetch).not.toHaveBeenCalled();
      await act(async () => {
        pending.resolve(replacement);
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain('page three');
      expect(view.textContent).not.toContain('Caught an unexpected error');
      expect(window.location.pathname).toBe('/three');
    } finally {
      await act(async () => {
        streamed.resolve(<p>page two</p>);
        pending.resolve(replacement);
        await pushed;
        await flush();
      });
    }
  },
);

test.each(['remove', 'replace', 'redirect'] as const)(
  'cached static navigation fills a missing route slot without overwriting queued updates (%s)',
  async (change) => {
    const ready = defer<void>();
    const redirected = defer<Elements>();
    const slotId = getRouteSlotId('/one');
    const Page = () => {
      use(ready.promise);
      return <p>page two</p>;
    };
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      sidebar: 'before',
      [IS_STATIC_ID]: true,
      _etags: { root: 1, [slotId]: 1, sidebar: 1 },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push({
      [ROUTE_ID]: ['/two', ''],
      [IS_STATIC_ID]: false,
      [getRouteSlotId('/two')]: <Page />,
    });
    let pushed: Promise<void> | undefined;
    try {
      await act(async () => {
        await controls.get('a')!.router.push('/two');
        await flush();
      });
      if (change === 'redirect') {
        mocks.queue.push(redirected.promise);
      }
      const fetch = vi.spyOn(globalThis, 'fetch');
      await act(async () => {
        startTransition(() => {
          void controls.get('a')!.merge({}, (prev) =>
            prev.then((elements) =>
              combineElements(
                combineElements({}, elements, {
                  filter: (key) => key !== slotId,
                }),
                {
                  sidebar: 'client',
                  ...(change === 'replace'
                    ? { [slotId]: <p>client page one</p> }
                    : {}),
                },
              ),
            ),
          );
          pushed = controls
            .get('a')!
            .router.push(change === 'redirect' ? '/redirect' : '/one#anchor');
        });
        if (change === 'redirect') {
          redirected.reject(
            createCustomError('moved', { location: '/one#anchor' }),
          );
        }
        await pushed;
        await flush();
      });
      expect(view.textContent).toContain(
        change === 'replace' ? 'client page one' : 'page one',
      );
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe('client');
      expect(window.location.pathname + window.location.hash).toBe(
        '/one#anchor',
      );
      expect(fetch).toHaveBeenCalledTimes(change === 'redirect' ? 1 : 0);
      mocks.queue.push({
        [ROUTE_ID]: ['/three', ''],
        [IS_STATIC_ID]: false,
        [getRouteSlotId('/three')]: <p>page three</p>,
      });
      await act(async () => {
        await controls.get('a')!.router.push('/three');
        await flush();
      });
      const headers = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(JSON.parse(headers.get(ETAGS_HEADER) ?? '{}')[slotId]).toBe(
        change === 'replace' ? undefined : 1,
      );
    } finally {
      await act(async () => {
        ready.resolve();
        redirected.resolve({});
        await pushed;
        await flush();
      });
    }
  },
);

test('an unrelated element update does not overwrite external history', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(payload('/two', <p>page two</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  window.history.replaceState({}, '', '/two?tab=external#external');
  await act(async () => {
    await controls.get('a')!.merge({ sidebar: 'updated' });
    await flush();
  });
  expect(view.querySelector('[data-sidebar]')?.textContent).toBe('updated');
  expect(window.location.search + window.location.hash).toBe(
    '?tab=external#external',
  );
});

test('an origin action response cannot replace a pending destination', async () => {
  const action = defer<Elements>();
  const navigation = defer<Elements>();
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(action.promise);
  let result!: Promise<unknown>;
  await act(async () => {
    result = unstable_callServerRsc('actions#action', []);
    await flush();
  });
  mocks.queue.push(navigation.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.get('a')!.router.push('/two');
    await flush();
  });
  await act(async () => {
    action.resolve({
      ...payload('/one', <p>stale action</p>),
      [IS_ORIGIN_ID]: true,
      _value: 7,
    });
    expect(await result).toBe(7);
    await flush();
  });
  expect(view.textContent).toContain('page one');
  expect(view.textContent).not.toContain('stale action');
  await act(async () => {
    navigation.resolve(payload('/two', <p>page two</p>));
    await pushed;
    await flush();
  });
  expect(view.textContent).toContain('page two');
  expect(window.location.pathname).toBe('/two');
});

test('a later response wins over an accepted destination that renders while it waits', async () => {
  const push = vi.spyOn(window.history, 'pushState');
  const ready = defer<void>();
  const next = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>cancelled page</p>;
  };
  const layout = (path: string, body: ReactNode) => ({
    ...payload(path, body),
    root: (
      <>
        <Probe id="a" />
        <aside>layout {path}</aside>
        <Children />
      </>
    ),
  });
  mocks.queue.push(layout('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(layout('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  mocks.queue.push(next.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    window.history.replaceState({}, '', '/one?tab=external#external');
    pushed = controls.get('a')!.router.push('/three');
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  await act(async () => {
    next.resolve(layout('/three', <p>page three</p>));
    await pushed;
    await flush();
  });
  expect(view.querySelector('aside')?.textContent).toBe('layout /three');
  expect(view.querySelector('output')?.textContent).toBe('/three');
  expect(window.location.pathname).toBe('/three');
  expect(push.mock.lastCall?.[2]?.toString()).toContain('/three');
});

test.each([
  'return',
  'second failure',
  'cancelled intermediate',
  'hash redirect',
] as const)(
  'a failed replacement keeps the instant action origin and refetches its abandoned response (%s)',
  async (scenario) => {
    const instant = defer<Elements>();
    const failed = defer<Elements>();
    const intermediate = defer<Elements>();
    mocks.queue.push({
      ...payload('/one', <p>page one</p>),
      [IS_STATIC_ID]: true,
      root: (
        <>
          <Probe id="a" />
          <ErrorBoundary>
            <Children />
          </ErrorBoundary>
        </>
      ),
      [getRouteSlotId('/two')]: <p>cached page two</p>,
      _etags: {
        root: 1,
        [getRouteSlotId('/one')]: 1,
        [getRouteSlotId('/two')]: 1,
      },
    });
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    mocks.queue.push(instant.promise);
    let painted: Promise<void> | undefined;
    let pushed: Promise<void> | undefined;
    let replaced: Promise<void> | undefined;
    try {
      await act(async () => {
        painted = controls.get('a')!.router.push('/two?q=2#anchor', {
          unstable_instant: true,
        });
        await flush();
      });
      expect(view.textContent).toContain('cached page two');
      expect(window.location.pathname).toBe('/two');
      mocks.queue.push(failed.promise);
      await act(async () => {
        pushed = controls.get('a')!.router.push('/three');
        void pushed.catch(() => {});
        await flush();
      });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      await act(async () => {
        failed.reject(new Error('offline'));
        await expect(pushed).rejects.toThrow('offline');
        await painted;
        await flush();
      });
      expect(window.location.pathname).toBe('/three');
      const fetch = vi.spyOn(globalThis, 'fetch');
      mocks.queue.push({ _value: 'updated' });
      await act(async () => {
        expect(await unstable_callServerRsc('actions#update', [])).toBe(
          'updated',
        );
        await flush();
      });
      expect(
        new Headers(fetch.mock.lastCall![1]?.headers).get(
          ACTION_LOCATION_HEADER,
        ),
      ).toBe('/two?q=2');
      if (scenario === 'cancelled intermediate') {
        mocks.queue.push(intermediate.promise);
        await act(async () => {
          replaced = controls.get('a')!.router.push('/four');
          await flush();
        });
      }
      if (
        scenario === 'second failure' ||
        scenario === 'cancelled intermediate'
      ) {
        const again = defer<Elements>();
        mocks.queue.push(again.promise);
        await act(async () => {
          const navigation = controls
            .get('a')!
            .router.push(
              scenario === 'cancelled intermediate' ? '/five' : '/four',
            );
          void navigation.catch(() => {});
          await flush();
          again.reject(new Error('offline again'));
          await expect(navigation).rejects.toThrow('offline again');
          await flush();
        });
      }
      fetch.mockClear();
      const redirect = defer<Elements>();
      if (scenario === 'hash redirect') {
        mocks.queue.push(redirect.promise);
      }
      mocks.queue.push({
        [ROUTE_ID]: ['/two', 'q=2'],
        [IS_STATIC_ID]: false,
        sidebar: 'fresh two',
      });
      await act(async () => {
        const navigation = controls.get('a')!.router.push('/two?q=2#anchor');
        if (scenario === 'hash redirect') {
          redirect.reject(
            createCustomError('moved', { location: '/two?q=2#moved' }),
          );
        }
        await navigation;
        await flush();
      });
      expect(fetch).toHaveBeenCalledTimes(scenario === 'hash redirect' ? 2 : 1);
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        'fresh two',
      );
      expect(window.location.pathname + window.location.search).toBe(
        '/two?q=2',
      );
      expect(window.location.hash).toBe(
        scenario === 'hash redirect' ? '#moved' : '#anchor',
      );
      fetch.mockClear();
      await act(async () => {
        await controls.get('a')!.router.push('/two?q=2#next');
        await flush();
      });
      expect(fetch).not.toHaveBeenCalled();
      expect(view.querySelector('[data-sidebar]')?.textContent).toBe(
        'fresh two',
      );
      expect(window.location.hash).toBe('#next');
    } finally {
      await act(async () => {
        instant.resolve({});
        failed.resolve({});
        intermediate.resolve({});
        await painted;
        await pushed?.catch(() => {});
        await replaced;
        await flush();
      });
    }
  },
);

test('a failed navigation keeps the last accepted layout even before it paints', async () => {
  const ready = defer<void>();
  const next = defer<Elements>();
  const Page = () => {
    use(ready.promise);
    return <p>cancelled page</p>;
  };
  const layout = (path: string, body: ReactNode) => ({
    ...payload(path, body),
    root: (
      <>
        <Probe id="a" />
        <aside>layout {path}</aside>
        <ErrorBoundary>
          <Children />
        </ErrorBoundary>
      </>
    ),
  });
  mocks.queue.push(layout('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  mocks.queue.push(layout('/two', <Page />));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  mocks.queue.push(next.promise);
  let pushed!: Promise<void>;
  await act(async () => {
    pushed = controls.get('a')!.router.push('/three');
    void pushed.catch(() => {});
    await flush();
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => {
    next.reject(new Error('offline'));
    await expect(pushed).rejects.toThrow('offline');
    await flush();
  });
  await act(async () => {
    ready.resolve();
    await flush();
  });
  expect(view.querySelector('aside')?.textContent).toBe('layout /two');
  expect(window.location.pathname).toBe('/three');
  const fetch = vi.spyOn(globalThis, 'fetch');
  mocks.queue.push({ _value: 'updated' });
  await act(async () => {
    expect(await unstable_callServerRsc('actions#update', [])).toBe('updated');
    await flush();
  });
  expect(
    new Headers(fetch.mock.lastCall![1]?.headers).get(ACTION_LOCATION_HEADER),
  ).toBe('/two');
});

test.each(['external redirect', 'fetch failure'] as const)(
  'a superseded %s returned by load does not affect the pending navigation',
  async (failure) => {
    const push = vi.spyOn(window.history, 'pushState');
    const leave = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});
    mocks.queue.push(payload('/one', <p>page one</p>));
    const view = await mount(
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
    );
    if (failure === 'fetch failure') {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockRejectedValueOnce(new TypeError('offline'))
          .mockResolvedValue(new Response('{}')),
      );
    }
    const next = defer<Elements>();
    mocks.queue.push({ _location: 'https://other.example/redirected' });
    mocks.queue.push(next.promise);
    const load = loader.load;
    let outcomeType: string | undefined;
    let abortedAtResolution: boolean | undefined;
    let signal: AbortSignal | undefined;
    let replacement!: Promise<void>;
    vi.spyOn(loader, 'load').mockImplementationOnce((...args) =>
      load(...args).then((outcome) => {
        outcomeType = outcome.type;
        signal = args[2].signal;
        abortedAtResolution = signal.aborted;
        replacement = controls.get('a')!.router.push('/three');
        return outcome;
      }),
    );
    let cancelledResult: 'fulfilled' | 'rejected' | undefined;
    await act(async () => {
      cancelledResult = await controls
        .get('a')!
        .router.push('/two')
        .then(
          () => 'fulfilled' as const,
          () => 'rejected' as const,
        );
      await flush();
    });
    expect(outcomeType).toBe(
      failure === 'external redirect' ? 'external' : 'failed',
    );
    expect(abortedAtResolution).toBe(false);
    expect(signal?.aborted).toBe(true);
    expect(leave).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(cancelledResult).toBe('fulfilled');
    expect(view.textContent).toContain('page one');
    expect(view.querySelector('output')?.textContent).toBe('/one');
    expect(window.location.pathname).toBe('/one');
    await act(async () => {
      next.resolve(payload('/three', <p>page three</p>));
      await replacement;
      await flush();
    });
    expect(view.textContent).toContain('page three');
    expect(view.querySelector('output')?.textContent).toBe('/three');
    expect(window.location.pathname).toBe('/three');
    expect(push).toHaveBeenCalledTimes(1);
    expect(leave).not.toHaveBeenCalled();
  },
);

test('a successful navigation clears the previously committed not-found error', async () => {
  mocks.queue.push(payload('/one', <p>page one</p>));
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const missing = defer<Elements>();
  mocks.queue.push(missing.promise);
  let failed!: Promise<void>;
  await act(async () => {
    failed = controls.get('a')!.router.push('/missing');
    void failed.catch(() => {});
    await flush();
  });
  await act(async () => {
    missing.reject(createCustomError('missing', { status: 404 }));
    await expect(failed).rejects.toThrow('missing');
    await flush();
  });
  expect(view.querySelector('h1')?.textContent).toBe('Not Found');
  expect(window.location.pathname).toBe('/missing');
  mocks.queue.push(payload('/two', <p>recovered page</p>));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.textContent).toContain('recovered page');
  expect(view.querySelector('output')?.textContent).toBe('/two');
  expect(view.querySelector('h1')).toBeNull();
  expect(window.location.pathname).toBe('/two');
});

test('an instant paint preserves an earlier queued update when the response omits its slot', async () => {
  mocks.queue.push({
    ...payload('/one', <p>page one</p>),
    root: (
      <>
        <Probe id="a" />
        <aside data-queued>
          <Suspense fallback="waiting">
            <Slot id="sidebar" />
          </Suspense>
        </aside>
        <Children />
      </>
    ),
    sidebar: 'before',
    [getRouteSlotId('/two')]: <p>cached page two</p>,
    _etags: { root: 1, [getRouteSlotId('/two')]: 1 },
  });
  const view = await mount(
    <Router initialRoute={{ path: '/one', query: '', hash: '' }} />,
  );
  const update = defer<Elements>();
  const response = defer<Elements>();
  let merged!: Promise<Elements>;
  let pushed!: Promise<void>;
  await act(async () => {
    merged = controls.get('a')!.merge(update.promise);
    mocks.queue.push(response.promise);
    pushed = controls.get('a')!.router.push('/two', { unstable_instant: true });
    await flush();
  });
  await act(async () => {
    update.resolve({ sidebar: 'queued update' });
    await merged;
    await flush();
  });
  await act(async () => {
    response.resolve({ [ROUTE_ID]: ['/two', ''], [IS_STATIC_ID]: false });
    await pushed;
    await flush();
  });
  expect(view.querySelector('[data-queued]')?.textContent).toBe(
    'queued update',
  );
  expect(view.textContent).toContain('cached page two');
  expect(window.location.pathname).toBe('/two');
});

test('concurrent Routers keep their navigation snapshots independent', async () => {
  mocks.queue.push(payload('/one', <p>first root</p>, 'a'));
  mocks.queue.push(payload('/other', <p>second root</p>, 'b'));
  const view = await mount(
    <>
      <Router initialRoute={{ path: '/one', query: '', hash: '' }} />
      <Router initialRoute={{ path: '/other', query: '', hash: '' }} />
    </>,
  );
  mocks.queue.push(payload('/two', <p>first moved</p>, 'a'));
  await act(async () => {
    await controls.get('a')!.router.push('/two');
    await flush();
  });
  expect(view.querySelector('[data-route="a"]')?.textContent).toBe('/two');
  expect(view.querySelector('[data-route="b"]')?.textContent).toBe('/other');
  expect(view.textContent).toContain('second root');
});
