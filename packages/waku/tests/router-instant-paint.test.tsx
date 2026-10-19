// @vitest-environment happy-dom

import {
  Suspense,
  act,
  lazy,
  startTransition,
  use,
  useEffect,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import {
  ETAGS_HEADER,
  ETAGS_ID,
  IMMUTABLE_ETAG,
} from '../src/lib/utils-isomorphic/etags.js';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from '../src/minimal/client.js';
import { Router, useRouter } from '../src/router/client.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
} from '../src/router/isomorphic-utils/router-protocol.js';

type Payload = Record<string, unknown>;

const testHoisted = vi.hoisted(() => ({
  responses: new Map<string, Array<Payload | Promise<Payload>>>(),
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: vi.fn(async (responsePromise: Promise<Response>) => {
      const url = await (await responsePromise).text();
      const payload = testHoisted.responses.get(url)?.shift();
      if (!payload) {
        throw new Error(`unexpected request: ${url}`);
      }
      return payload;
    }),
    encodeReply: vi.fn(async () => ''),
    createTemporaryReferenceSet: vi.fn(() => new Map()),
  },
}));

const respond = (
  path: string,
  payload: Payload | Promise<Payload>,
  query = '',
) => {
  const url = `/RSC/R${path}.txt?${new URLSearchParams({ query })}`;
  testHoisted.responses.set(url, [
    ...(testHoisted.responses.get(url) ?? []),
    payload,
  ]);
};

let router: ReturnType<typeof useRouter> | undefined;

const CaptureRouter = () => {
  const value = useRouter();
  useEffect(() => {
    router = value;
  });
  return null;
};

const layout = () => (
  <>
    <CaptureRouter />
    <Children />
  </>
);

const routePayload = (
  path: string,
  shell: unknown,
  extra: Payload = {},
  query = '',
): Payload => ({
  root: layout(),
  [`route:${path}`]: shell,
  ...extra,
  [ROUTE_ID]: [path, query],
  [IS_STATIC_ID]: false,
  [ETAGS_ID]: { root: IMMUTABLE_ETAG, [`route:${path}`]: IMMUTABLE_ETAG },
});

const startPayload = (): Payload => ({
  'route:/start': <p>start</p>,
  [ROUTE_ID]: ['/start', ''],
  [IS_STATIC_ID]: false,
});

const nextPage = () => (
  <>
    <h1>next</h1>
    <Suspense fallback={<i>waiting</i>}>
      <Slot id="clock" />
    </Suspense>
  </>
);

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (input) => new Response(String(input)),
  );
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

test('an instant navigation paints the cached shell before its response', async () => {
  window.history.replaceState({}, '', '/next');
  respond('/next', routePayload('/next', nextPage(), { clock: 'tick-1' }));
  respond('/start', startPayload());
  const next = Promise.withResolvers<Payload>();
  respond('/next', next.promise);

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Router />);
  });
  expect(container.textContent).toBe('nexttick-1');

  await act(async () => {
    await router!.push('/start');
  });
  expect(container.textContent).toBe('start');

  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/next', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    next.resolve(routePayload('/next', nextPage(), { clock: 'tick-2' }));
    await navigated;
  });
  expect(container.textContent).toBe('nexttick-2');

  act(() => root.unmount());
});

test('an instant navigation paints a primitive shell before its response', async () => {
  window.history.replaceState({}, '', '/about');
  respond('/about', routePayload('/about', 'about'));
  respond('/start', startPayload());
  const about = Promise.withResolvers<Payload>();
  respond('/about', about.promise);

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(<Router />);
  });
  expect(container.textContent).toBe('about');

  await act(async () => {
    await router!.push('/start');
  });
  expect(container.textContent).toBe('start');

  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/about', { unstable_instant: true });
  });
  expect(container.textContent).toBe('about');

  await act(async () => {
    about.resolve(routePayload('/about', 'about'));
    await navigated;
  });
  expect(container.textContent).toBe('about');

  act(() => root.unmount());
});

test('an instant shell stays painted while the response copy is streaming', async () => {
  window.history.replaceState({}, '', '/streamed');
  respond(
    '/streamed',
    routePayload('/streamed', nextPage(), { clock: 'before' }),
  );
  respond('/start', startPayload());
  const streamed = Promise.withResolvers<Payload>();
  respond('/streamed', streamed.promise);
  const shellReady = Promise.withResolvers<void>();
  const StreamingShell = lazy(async () => {
    await shellReady.promise;
    return { default: nextPage };
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Suspense fallback={<b>outer fallback</b>}>
        <Router />
      </Suspense>,
    );
  });
  await act(async () => {
    await router!.push('/start');
  });
  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/streamed', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    streamed.resolve(
      routePayload('/streamed', <StreamingShell />, { clock: 'after' }),
    );
    await navigated;
  });

  expect(container.textContent).toBe('nextafter');
  await act(async () => {
    shellReady.resolve();
  });
  act(() => root.unmount());
});

test('an instant shell painted from a prefetch stays while the response copy is streaming', async () => {
  window.history.replaceState({}, '', '/home');
  respond('/home', routePayload('/home', <p>home</p>));
  // two prefetches of one route: the shell comes from the one that arrived,
  // the response from the one still streaming
  const q1 = Promise.withResolvers<Payload>();
  respond('/prefetched', q1.promise, 'q=1');
  respond(
    '/prefetched',
    routePayload('/prefetched', nextPage(), { clock: 'before' }, 'q=2'),
    'q=2',
  );
  const shellReady = Promise.withResolvers<void>();
  const StreamingShell = lazy(async () => {
    await shellReady.promise;
    return { default: nextPage };
  });

  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <Suspense fallback={<b>outer fallback</b>}>
        <Router />
      </Suspense>,
    );
  });
  expect(container.textContent).toBe('home');
  await act(async () => {
    router!.prefetch('/prefetched?q=1');
    router!.prefetch('/prefetched?q=2');
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  let navigated: Promise<void> | undefined;
  await act(async () => {
    navigated = router!.push('/prefetched?q=1', { unstable_instant: true });
  });
  expect(container.textContent).toBe('nextwaiting');

  await act(async () => {
    q1.resolve(
      routePayload(
        '/prefetched',
        <StreamingShell />,
        { clock: 'after' },
        'q=1',
      ),
    );
    await navigated;
  });

  expect(container.textContent).toBe('nextafter');
  await act(async () => {
    shellReady.resolve();
  });
  act(() => root.unmount());
});

test.each(['remove', 'replace'] as const)(
  'an accepted instant navigation restores only missing prefetched route slots (%s)',
  async (change) => {
    window.history.replaceState({}, '', '/prefetch-origin');
    let merge: ReturnType<typeof useMergeElements> | undefined;
    const CaptureMerge = () => {
      const value = useMergeElements();
      useEffect(() => {
        merge = value;
      });
      return null;
    };
    const sharedRoot = (
      <>
        <CaptureRouter />
        <CaptureMerge />
        <Children />
      </>
    );
    const shell = (
      <>
        <h1>prefetched shell</h1>
        <aside>
          <Suspense fallback="waiting">
            <Slot id="sidebar" />
          </Suspense>
        </aside>
      </>
    );
    const slotId = 'route:/prefetch-only';
    respond('/prefetch-origin', {
      root: sharedRoot,
      'route:/prefetch-origin': <p>origin</p>,
      sidebar: 'origin sidebar',
      [ROUTE_ID]: ['/prefetch-origin', ''],
      [IS_STATIC_ID]: false,
      [ETAGS_ID]: {
        root: IMMUTABLE_ETAG,
        sidebar: 'origin-v1',
      },
    });
    respond(
      '/prefetch-only',
      {
        root: sharedRoot,
        [slotId]: shell,
        sidebar: 'prefetched sidebar',
        [ROUTE_ID]: ['/prefetch-only', 'q=cached'],
        [IS_STATIC_ID]: false,
        [ETAGS_ID]: {
          root: IMMUTABLE_ETAG,
          [slotId]: IMMUTABLE_ETAG,
          sidebar: 'prefetched-v1',
        },
      },
      'q=cached',
    );
    const response = Promise.withResolvers<Payload>();
    const responsePatch = {
      sidebar: 'server sidebar',
      [ROUTE_ID]: ['/prefetch-only', 'q=live'],
      [IS_STATIC_ID]: false,
      [ETAGS_ID]: { sidebar: 'response-v2' },
    };
    respond('/prefetch-only', response.promise, 'q=live');
    const errors: unknown[] = [];
    const container = document.createElement('div');
    const root = createRoot(container, {
      onCaughtError: (error) => errors.push(error),
      onRecoverableError: (error) => errors.push(error),
    });
    let navigated: Promise<void> | undefined;
    try {
      await act(async () => {
        root.render(<Router />);
      });
      expect(container.textContent).toBe('origin');
      await act(async () => {
        router!.prefetch('/prefetch-only?q=cached');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      await act(async () => {
        navigated = router!.push('/prefetch-only?q=live#details', {
          unstable_instant: true,
        });
      });
      expect(container.textContent).toBe('prefetched shellwaiting');
      const fetch = vi.mocked(globalThis.fetch);
      const requestHeaders = new Headers(fetch.mock.lastCall![1]?.headers);
      expect(
        JSON.parse(requestHeaders.get(ETAGS_HEADER) ?? '{}'),
      ).toMatchObject({ [slotId]: IMMUTABLE_ETAG, sidebar: 'prefetched-v1' });
      await act(async () => {
        startTransition(() => {
          void merge!({}, (prevPromise) =>
            prevPromise.then((prev) =>
              combineElements(
                combineElements({}, prev, {
                  filter: (key) => key !== slotId,
                }),
                {
                  sidebar: 'client sidebar',
                  ...(change === 'replace'
                    ? {
                        [slotId]: (
                          <>
                            <h1>client shell</h1>
                            <aside>
                              <Slot id="sidebar" />
                            </aside>
                          </>
                        ),
                      }
                    : {}),
                },
              ),
            ),
          );
        });
        response.resolve(responsePatch);
        await navigated;
      });
      expect(errors).toEqual([]);
      expect(container.querySelector('h1')?.textContent).toBe(
        change === 'replace' ? 'client shell' : 'prefetched shell',
      );
      expect(container.querySelector('aside')?.textContent).toBe(
        'client sidebar',
      );
      expect(
        window.location.pathname +
          window.location.search +
          window.location.hash,
      ).toBe('/prefetch-only?q=live#details');
      respond('/prefetch-next', {
        'route:/prefetch-next': <p>next destination</p>,
        [ROUTE_ID]: ['/prefetch-next', ''],
        [IS_STATIC_ID]: false,
      });
      await act(async () => {
        await router!.push('/prefetch-next');
      });
      const nextHeaders = new Headers(fetch.mock.lastCall![1]?.headers);
      const etags = JSON.parse(nextHeaders.get(ETAGS_HEADER) ?? '{}');
      expect(etags[slotId]).toBe(
        change === 'replace' ? undefined : IMMUTABLE_ETAG,
      );
      expect(etags.sidebar).toBeUndefined();
      expect(container.textContent).toBe('next destination');
    } finally {
      await act(async () => {
        response.resolve(responsePatch);
        await navigated?.catch(() => {});
        root.unmount();
      });
    }
  },
);

test('two Roots settle a shared instant response after an update in only one Root', async () => {
  const clientState = Symbol('client state');
  const controls = new Map<
    string,
    {
      router: ReturnType<typeof useRouter>;
      merge: ReturnType<typeof useMergeElements>;
    }
  >();
  const Capture = () => {
    const router = useRouter();
    const [id] = useState(router.path);
    const merge = useMergeElements();
    const elements = use(useElementsPromise());
    useEffect(() => {
      controls.set(id, { router, merge });
    });
    return (
      <>
        <output>{String(elements[clientState] ?? 'initial')}</output>
        <aside>
          <Suspense fallback="sidebar waiting">
            <Slot id="sidebar" />
          </Suspense>
        </aside>
      </>
    );
  };
  const shell = nextPage();
  const sharedRoot = (
    <>
      <Capture />
      <Children />
    </>
  );
  const ids = ['first', 'second'];
  for (const id of ids) {
    respond(`/shared-${id}`, {
      root: sharedRoot,
      [`route:/shared-${id}`]: <p>origin</p>,
      'route:/shared-next': shell,
      sidebar: 'before',
      clock: 'before',
      [ROUTE_ID]: [`/shared-${id}`, ''],
      [IS_STATIC_ID]: false,
      [ETAGS_ID]: {
        root: IMMUTABLE_ETAG,
        'route:/shared-next': IMMUTABLE_ETAG,
      },
    });
  }
  const response = Promise.withResolvers<Payload>();
  const responsePatch = {
    [ROUTE_ID]: ['/shared-next', ''],
    [IS_STATIC_ID]: false,
    sidebar: 'server',
    clock: <Slot id="details" />,
    details: 'shared details',
    [ETAGS_ID]: { sidebar: 'server-v1', details: 'details-v1' },
  };
  respond('/shared-next', response.promise);
  respond('/shared-next', response.promise);
  window.history.replaceState({}, '', '/shared-first');
  const container = document.createElement('div');
  const errors: unknown[] = [];
  const root = createRoot(container, {
    onCaughtError: (error) => errors.push(error),
    onRecoverableError: (error) => errors.push(error),
  });
  const navigations: Promise<void>[] = [];
  try {
    await act(async () => {
      root.render(
        <>
          {ids.map((id) => (
            <section key={id} data-root={id}>
              <Router
                initialRoute={{ path: `/shared-${id}`, query: '', hash: '' }}
              />
            </section>
          ))}
        </>,
      );
    });
    await act(async () => {
      for (const id of ids) {
        navigations.push(
          controls.get(`/shared-${id}`)!.router.push('/shared-next', {
            unstable_instant: true,
          }),
        );
      }
    });
    for (const section of container.querySelectorAll('section')) {
      expect(section.querySelector('h1')?.textContent).toBe('next');
      expect(section.textContent).toContain('waiting');
    }
    await act(async () => {
      await controls.get('/shared-first')!.merge({
        sidebar: 'client',
        [clientState]: 'first update',
      });
    });
    await act(async () => {
      response.resolve(responsePatch);
      await Promise.all(navigations);
    });
    const first = container.querySelector('[data-root="first"]')!;
    const second = container.querySelector('[data-root="second"]')!;
    expect(first.querySelector('output')?.textContent).toBe('first update');
    expect(first.querySelector('aside')?.textContent).toBe('client');
    expect(second.querySelector('output')?.textContent).toBe('initial');
    expect(second.querySelector('aside')?.textContent).toBe('server');
    for (const section of [first, second]) {
      expect(section.textContent).toContain('nextshared details');
      expect(section.textContent).not.toContain('waiting');
    }
    expect(errors).toEqual([]);
    expect(window.location.pathname).toBe('/shared-next');
  } finally {
    await act(async () => {
      response.resolve(responsePatch);
      await Promise.allSettled(navigations);
      root.unmount();
    });
  }
});
