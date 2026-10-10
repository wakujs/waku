// @vitest-environment happy-dom

import {
  Component,
  StrictMode,
  Suspense,
  act,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { getErrorInfo } from '../src/lib/utils-isomorphic/custom-errors.js';
import { ETAGS_ID } from '../src/lib/utils-isomorphic/etags.js';
import { unstable_callServerRsc } from '../src/minimal/client-runtime.js';
import {
  clearInitialRscEntries,
  getInitialRscEntry,
} from '../src/minimal/client-utils/initial-rsc-store.js';
import {
  clearRootCachedEtags,
  getDefaultRootStore,
  registerRootStore,
} from '../src/minimal/client-utils/root-store.js';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useFetchRsc_UNSTABLE,
  useMergeElements_UNSTABLE,
} from '../src/minimal/client.js';

type CallServer = (funcId: string, args: unknown[]) => Promise<unknown>;

const mocks = vi.hoisted(() => ({
  createFromFetch:
    vi.fn<
      (
        responsePromise: Promise<Response>,
        options?: { callServer?: CallServer },
      ) => Promise<Record<string, unknown>>
    >(),
  encodeReply:
    vi.fn<(value: unknown) => Promise<string | URLSearchParams | FormData>>(),
  createTemporaryReferenceSet: vi.fn<() => Map<string, unknown>>(),
}));

vi.mock('react-server-dom-webpack/client', () => ({
  default: {
    createFromFetch: mocks.createFromFetch,
    encodeReply: mocks.encodeReply,
    createTemporaryReferenceSet: mocks.createTemporaryReferenceSet,
  },
}));

const wait = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const resolvedThenable = <T,>(value: T): Promise<T> =>
  Object.assign(Promise.resolve(value), {
    status: 'fulfilled' as const,
    value,
  });

const useRefetch = () => {
  const fetchRsc = useFetchRsc_UNSTABLE();
  const mergeElements = useMergeElements_UNSTABLE();
  return (rscPath: string, rscParams?: unknown) =>
    mergeElements(fetchRsc(rscPath, rscParams));
};

type Refetch = ReturnType<typeof useRefetch>;

const stubFetch = () =>
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));

let fetchRsc: ReturnType<typeof useFetchRsc_UNSTABLE>;

beforeAll(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const Probe = () => {
    const rootlessFetch = useFetchRsc_UNSTABLE();
    useEffect(() => {
      fetchRsc = rootlessFetch;
    });
    return null;
  };
  const root = createRoot(document.createElement('div'));
  await act(async () => {
    root.render(<Probe />);
  });
  act(() => root.unmount());
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
});

beforeEach(() => {
  mocks.createFromFetch.mockReset();
  mocks.createFromFetch.mockImplementation(async (responsePromise) => {
    const response = await responsePromise;
    return { _value: null, text: await response.text() };
  });
  mocks.encodeReply.mockResolvedValue('');
  mocks.createTemporaryReferenceSet.mockReturnValue(new Map());
});

afterEach(() => {
  clearInitialRscEntries();
  delete (globalThis as any).__WAKU_PREFETCHED__;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('minimal/client fetch', () => {
  test('a fetch returns the decoded elements', async () => {
    // Minimal only fetches + decodes and hands the promise back to the caller.
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response('prefetched'),
    );
    vi.stubGlobal('fetch', fetchMock);
    const rscParams = new URLSearchParams({ query: 'x=1' });

    const elements = await fetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    expect(elements).toEqual({ text: 'prefetched' });
  });

  test('each fetch issues a new request for the same input', async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response('x'));
    vi.stubGlobal('fetch', fetchMock);
    const rscParams = new URLSearchParams({ query: 'x=1' });

    await fetchRsc('R/next.txt', rscParams);
    await fetchRsc('R/next.txt', rscParams);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
  });

  test('Root releases its initial fetch after committing', async () => {
    mocks.createFromFetch.mockReturnValue(
      resolvedThenable({ _value: null, App: 'app' }),
    );
    stubFetch();
    const rscParams = { value: 1 };
    const render = async () => {
      const root = createRoot(document.createElement('div'));
      await act(async () => {
        root.render(
          <StrictMode>
            <Root initialRscPath="R/app.txt" initialRscParams={rscParams}>
              <Suspense fallback={null}>
                <Slot id="App" />
              </Suspense>
            </Root>
          </StrictMode>,
        );
      });
      return root;
    };

    const firstRoot = await render();
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(1);
    act(() => firstRoot.unmount());

    const secondRoot = await render();
    expect(mocks.createFromFetch).toHaveBeenCalledTimes(2);
    act(() => secondRoot.unmount());
  });

  test('bounds uncommitted initial fetches', () => {
    const first = getInitialRscEntry('0', undefined, () => Promise.resolve({}));
    for (let index = 1; index <= 32; index += 1) {
      void getInitialRscEntry(String(index), undefined, () =>
        Promise.resolve({}),
      );
    }
    const create = vi.fn(() => Promise.resolve({}));

    expect(getInitialRscEntry('0', undefined, create)).not.toBe(first);
    expect(create).toHaveBeenCalledOnce();
  });

  test('a Root that suspended on its initial fetch gets the rejection, not another fetch', async () => {
    mocks.createFromFetch.mockImplementation(() =>
      Promise.reject(new Error('failed')),
    );
    stubFetch();
    class Catch extends Component<
      { children: ReactNode },
      { error?: unknown }
    > {
      constructor(props: { children: ReactNode }) {
        super(props);
        this.state = {};
      }
      static getDerivedStateFromError(error: unknown) {
        return { error };
      }
      render() {
        return 'error' in this.state
          ? String(this.state.error)
          : this.props.children;
      }
    }

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Catch>
            <Slot id="App" />
          </Catch>
        </Root>,
      );
    });

    expect(container.textContent).toBe('Error: failed');
    expect(mocks.createFromFetch).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  test('server actions use the current fetch, not the one elements decoded with', async () => {
    // Capture the callServer baked into the fetched elements.
    let callServer: CallServer | undefined;
    mocks.createFromFetch.mockImplementation((_responsePromise, options) => {
      callServer ??= options?.callServer;
      return Promise.resolve({ _value: null });
    });

    const prefetchFetch = vi.fn<typeof fetch>(async () => new Response('p'));
    const actionFetch = vi.fn<typeof fetch>(async () => new Response('n'));

    // Fetch elements with one fetch...
    vi.stubGlobal('fetch', prefetchFetch);
    await fetchRsc('R/page.txt');
    // ...then the app registers a different fetch.
    vi.stubGlobal('fetch', actionFetch);

    // A server action must use the currently registered fetch: the callServer
    // closure does not pin the fetch the prefetch was decoded with.
    await callServer!('actions#doThing', []);

    expect(prefetchFetch).toHaveBeenCalledTimes(1); // only the prefetch request
    expect(actionFetch).toHaveBeenCalledTimes(1); // the server action request
  });
});

describe('minimal/client transport failures', () => {
  const redirectedResponse = (url: string) =>
    ({
      redirected: true,
      url,
      ok: true,
      status: 200,
      text: async () => 'the payload',
    }) as unknown as Response;

  test('a redirect within the rsc endpoint is decoded as the payload', async () => {
    vi.stubGlobal('fetch', async () =>
      redirectedResponse(`${window.location.origin}/RSC/R/exists.txt`),
    );

    // decoded from the response the redirect landed on
    await expect(fetchRsc('R/redirect.txt')).resolves.toMatchObject({
      text: 'the payload',
    });
  });

  test('a redirect the fetch did not follow is reported as a status', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        ({
          redirected: false,
          url: `${window.location.origin}/RSC/R/next.txt`,
          ok: false,
          status: 307,
          statusText: 'Temporary Redirect',
          headers: new Headers({ location: '/login' }),
          text: async () => '',
        }) as unknown as Response,
    );

    const error = await fetchRsc('R/next.txt').catch((e: unknown) => e);

    // waku never reads Location, so a fetch enhancer using redirect: 'manual'
    // is not supported. Decided 2026-07-30; revisit with a real use case.
    expect(getErrorInfo(error)).toEqual({ status: 307 });
  });

  test('a redirected response is decoded like any other', async () => {
    // where the response came from does not matter, only what it carries
    const url = 'https://login.example/anywhere';
    vi.stubGlobal('fetch', async () => redirectedResponse(url));
    mocks.createFromFetch.mockResolvedValueOnce({ App: 'ok' });

    await expect(fetchRsc('R/next.txt')).resolves.toEqual({
      App: 'ok',
    });
  });

  test('a network error is marked as such', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    const error = await fetchRsc('R/next.txt').catch((e: unknown) => e);

    expect(getErrorInfo(error)).toEqual({ unstable_networkError: true });
    expect((error as Error).message).toBe('Failed to fetch');
  });

  test('any other failure passes through untouched', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.reject(new DOMException('Aborted', 'AbortError')),
    );
    const aborted = await fetchRsc('R/next.txt').catch((e: unknown) => e);

    expect((aborted as Error).name).toBe('AbortError');
    expect(getErrorInfo(aborted)).toBeNull();

    // an app's own failure (a fetch enhancer, an unserializable argument)
    // reaches the caller as it is
    const appError = new Error('could not serialize');
    vi.stubGlobal('fetch', () => Promise.reject(appError));
    const thrown = await fetchRsc('R/other.txt').catch((e: unknown) => e);

    expect(thrown).toBe(appError);
  });
});

describe('minimal/client server actions', () => {
  test('returned elements re-render the tree', async () => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable({ App: 'A' }));
    stubFetch();

    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          <Suspense fallback={null}>
            <Slot id="App" />
          </Suspense>
        </Root>,
      );
    });
    expect(container.textContent).toBe('A');

    // A server action returns an updated slot and a return value.
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: 'result',
      _buildId: 'build',
      [ETAGS_ID]: { App: 'v' },
      App: 'B',
    });
    let value: unknown;
    await act(async () => {
      value = await unstable_callServerRsc('actions#do', []);
    });

    expect(value).toBe('result');
    expect(container.textContent).toBe('B');
    expect(getDefaultRootStore()?.etags).toEqual({ App: 'v' });

    act(() => root.unmount());
  });

  test('a document location is reported as an error, not merged', async () => {
    // minimal only tags it; deciding what a location means is the router's
    mocks.createFromFetch.mockResolvedValueOnce({
      _location: 'https://other.example/next',
    });
    stubFetch();

    const error = await fetchRsc('R/next.txt').catch((e: unknown) => e);

    expect(getErrorInfo(error)).toEqual({
      location: 'https://other.example/next',
      unstable_leave: true,
    });
  });

  test('a server action returning elements throws when no Root is mounted', async () => {
    // The merge must fail loudly (not silently drop) when there is no
    // default Root bridge, so timing/wiring bugs surface.
    mocks.createFromFetch.mockResolvedValueOnce({ _value: 'v', foo: 'FOO' });
    stubFetch();

    await expect(unstable_callServerRsc('actions#do', [])).rejects.toThrow(
      'Server action returned elements without a mounted Root component',
    );
  });

  test('a value-only action needs no Root, whatever reserved keys it carries', async () => {
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: 'v',
      _buildId: 'build',
    });
    stubFetch();

    await expect(unstable_callServerRsc('actions#do', [])).resolves.toBe('v');
  });

  test('an action response targets its request-time Root', async () => {
    let resolveAction: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    stubFetch();
    const firstSetElements = vi.fn();
    const secondSetElements = vi.fn();
    const unregisterFirst = registerRootStore({
      setElements: firstSetElements,
      etags: { App: 'first' },
      enhancers: [],
      fetchRsc: vi.fn(),
    });

    const action = unstable_callServerRsc('actions#do', []);
    const unregisterSecond = registerRootStore({
      setElements: secondSetElements,
      etags: { App: 'second' },
      enhancers: [],
      fetchRsc: vi.fn(),
    });
    resolveAction({ _value: 'result', App: 'updated' });

    try {
      await expect(action).resolves.toBe('result');
      expect(firstSetElements).toHaveBeenCalledOnce();
      expect(secondSetElements).not.toHaveBeenCalled();
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });

  test('an action response is not retargeted after its Root unmounts', async () => {
    let resolveAction: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAction = resolve;
      }),
    );
    stubFetch();
    const firstSetElements = vi.fn();
    const secondSetElements = vi.fn();
    const unregisterFirst = registerRootStore({
      setElements: firstSetElements,
      etags: { App: 'first' },
      enhancers: [],
      fetchRsc: vi.fn(),
    });

    const action = unstable_callServerRsc('actions#do', []);
    unregisterFirst();
    const unregisterSecond = registerRootStore({
      setElements: secondSetElements,
      etags: { App: 'second' },
      enhancers: [],
      fetchRsc: vi.fn(),
    });
    resolveAction({ _value: 'result', App: 'updated' });

    try {
      await expect(action).resolves.toBe('result');
      expect(firstSetElements).toHaveBeenCalledOnce();
      expect(secondSetElements).not.toHaveBeenCalled();
    } finally {
      unregisterSecond();
    }
  });

  test('HMR clears cached etags from every mounted Root', () => {
    const first = {
      setElements: vi.fn(),
      etags: { App: 'first' },
      enhancers: [],
      fetchRsc: vi.fn(),
    };
    const second = {
      setElements: vi.fn(),
      etags: { App: 'second' },
      enhancers: [],
      fetchRsc: vi.fn(),
    };
    const unregisterFirst = registerRootStore(first);
    const unregisterSecond = registerRootStore(second);

    try {
      clearRootCachedEtags();
      expect(first.etags).toEqual({});
      expect(second.etags).toEqual({});
    } finally {
      unregisterSecond();
      unregisterFirst();
    }
  });

  test('a descendant mount effect can call a server action', async () => {
    mocks.createFromFetch
      .mockResolvedValueOnce({ _value: null })
      .mockResolvedValueOnce({ _value: 'result', App: 'updated' });
    stubFetch();
    let action: Promise<unknown> | undefined;
    const ActionOnMount = () => {
      useEffect(() => {
        action = unstable_callServerRsc('actions#do', []);
        void action.catch(() => {});
      }, []);
      return null;
    };
    const root = createRoot(document.createElement('div'));

    try {
      await act(async () => {
        root.render(
          <Root>
            <ActionOnMount />
          </Root>,
        );
      });
      await expect(action).resolves.toBe('result');
    } finally {
      act(() => root.unmount());
    }
  });
});

describe('minimal/client build id mismatch', () => {
  test('a stale build id triggers the provided handler', async () => {
    vi.stubEnv('WAKU_BUILD_ID', 'build-1');
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: null,
      _buildId: 'build-2',
    });
    stubFetch();
    const onBuildIdMismatch = vi.fn();

    await fetchRsc('R/x.txt', undefined, { onBuildIdMismatch });
    await wait();

    expect(onBuildIdMismatch).toHaveBeenCalledTimes(1);
  });

  test('a matching build id does not trigger the handler', async () => {
    vi.stubEnv('WAKU_BUILD_ID', 'build-1');
    mocks.createFromFetch.mockResolvedValueOnce({
      _value: null,
      _buildId: 'build-1',
    });
    stubFetch();
    const onBuildIdMismatch = vi.fn();

    await fetchRsc('R/y.txt', undefined, { onBuildIdMismatch });
    await wait();

    expect(onBuildIdMismatch).not.toHaveBeenCalled();
  });
});

describe('minimal/client refetch scenarios', () => {
  // No-router scenario tests for refetch's merge behavior.
  const mount = async (
    initial: Record<string, unknown>,
    ui: (refetchRef: { current?: Refetch }) => ReactNode,
  ) => {
    mocks.createFromFetch.mockReturnValueOnce(resolvedThenable(initial));
    stubFetch();
    const refetchRef: { current?: Refetch } = {};
    const Probe = () => {
      const refetch = useRefetch();
      useEffect(() => {
        refetchRef.current = refetch;
      });
      return null;
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => {
      root.render(
        <Root initialRscPath="R/app.txt">
          {ui(refetchRef)}
          <Probe />
        </Root>,
      );
    });
    return {
      container,
      refetch: () => refetchRef.current!,
      unmount: () => act(() => root.unmount()),
    };
  };

  test('suspend: a default slot suspends on b, then shows b', async () => {
    const view = await mount({ _value: null, main: 'M1' }, () => (
      <Suspense fallback={<span>loading</span>}>
        <Slot id="main" />
      </Suspense>
    ));
    expect(view.container.textContent).toBe('M1');

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    await act(async () => {
      void view.refetch()('R/next.txt');
    });
    expect(view.container.textContent).toBe('loading');

    await act(async () => {
      resolveB({ main: 'M2' });
      await wait();
    });
    expect(view.container.textContent).toBe('M2');

    view.unmount();
  });

  test('a merge that fails while an earlier one waits is not left unhandled', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const view = await mount({ main: 'M1' }, () => (
      <Suspense fallback={<span>loading</span>}>
        <Slot id="main" />
      </Suspense>
    ));
    const first = Promise.withResolvers<Record<string, unknown>>();

    await act(async () => {
      mocks.createFromFetch.mockReturnValueOnce(first.promise);
      mocks.createFromFetch.mockReturnValueOnce(
        Promise.reject(new Error('offline')),
      );
      void view.refetch()('R/first.txt');
      void view.refetch()('R/second.txt');
    });
    await wait();
    process.off('unhandledRejection', unhandled);

    expect(unhandled).not.toHaveBeenCalled();
    await act(async () => {
      first.resolve({ main: 'M2' });
      await wait();
    });
    view.unmount();
  });

  // createFromFetch says it returns a promise, but hands back a pending
  // thenable whose `then` returns nothing
  const pendingThenable = (value: Record<string, unknown>) => {
    const resolvers: ((v: Record<string, unknown>) => void)[] = [];
    return {
      thenable: {
        then(resolve: (v: Record<string, unknown>) => void) {
          resolvers.push(resolve);
        },
      } as unknown as Promise<Record<string, unknown>>,
      settle: () => resolvers.forEach((resolve) => resolve(value)),
    };
  };

  test('a decoded payload comes back chainable, not as react gave it', async () => {
    const { thenable, settle } = pendingThenable({ _value: null, page: 'P2' });
    mocks.createFromFetch.mockReturnValue(thenable);
    stubFetch();

    // a thenable would return undefined from then, so this would throw
    const chained = fetchRsc('R/next.txt')
      .then((elements) => elements)
      .finally(() => {});
    await wait();
    settle();

    await expect(chained).resolves.toMatchObject({ page: 'P2' });
  });

  test('new key: a slot b introduces suspends, then shows b', async () => {
    let mountExtra = () => {};
    const view = await mount({ _value: null, main: 'M1' }, (ref) => {
      const Holder = () => {
        const refetch = useRefetch();
        const [extra, setExtra] = useState(false);
        useEffect(() => {
          ref.current = refetch;
          mountExtra = () => setExtra(true);
        });
        return extra ? (
          <Suspense fallback={<span>loading</span>}>
            <Slot id="extra" />
          </Suspense>
        ) : null;
      };
      return <Holder />;
    });
    expect(view.container.textContent).toBe('');

    let resolveB: (value: Record<string, unknown>) => void = () => {};
    mocks.createFromFetch.mockReturnValueOnce(
      new Promise<Record<string, unknown>>((resolve) => {
        resolveB = resolve;
      }),
    );
    await act(async () => {
      void view.refetch()('R/next.txt');
    });
    await act(async () => {
      mountExtra();
    });
    // `extra` is not in a; the merged map suspends on b until it arrives.
    expect(view.container.textContent).toBe('loading');

    await act(async () => {
      resolveB({ main: 'M1', extra: 'X' });
      await wait();
    });
    expect(view.container.textContent).toBe('X');

    view.unmount();
  });

  test('hold on omit: keeps a slot a had when b omits it', async () => {
    const view = await mount(
      { _value: null, kept: 'K1', changed: 'C1' },
      () => (
        <Suspense fallback={null}>
          <Slot id="kept" />
          <Slot id="changed" />
        </Suspense>
      ),
    );
    expect(view.container.textContent).toBe('K1C1');

    // b omits `kept` and refreshes `changed`.
    mocks.createFromFetch.mockReturnValueOnce(
      resolvedThenable({ changed: 'C2' }),
    );
    await act(async () => {
      await view.refetch()('R/next.txt');
    });
    // `kept` holds its old value (b omitted it); `changed` swaps to C2.
    expect(view.container.textContent).toBe('K1C2');

    view.unmount();
  });
});
