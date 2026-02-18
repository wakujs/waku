// @vitest-environment happy-dom

import { StrictMode, act } from 'react';
import type { ReactElement } from 'react';
import { preloadModule } from 'react-dom';
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
import { createCustomError } from '../src/lib/utils/custom-errors.js';
import {
  Children,
  INTERNAL_ServerRoot,
  Root,
  prefetchRsc,
  useEnhanceFetchRscInternal_UNSTABLE,
  useRefetch,
} from '../src/minimal/client.js';
import {
  ErrorBoundary,
  INTERNAL_ServerRouter,
  Link,
  Router,
  unstable_RouterContext as RouterContext,
  Slice,
  unstable_encodeRoutePath,
  unstable_encodeSliceId,
  unstable_getHttpStatusFromMeta,
  unstable_getRouteSlotId,
  unstable_getSliceSlotId,
  unstable_parseRoute,
  useRouter,
} from '../src/router/client.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  SKIP_HEADER,
} from '../src/router/common.js';

type ElementsMap = Record<string, unknown>;
type RouterApi = ReturnType<typeof useRouter>;
type RouterFetchCache = NonNullable<
  Parameters<typeof Router>[0]['unstable_fetchCache']
>;
type IntersectionObserverMockInstance = IntersectionObserver & {
  callback: IntersectionObserverCallback;
};

const createRefetchMock = () =>
  vi.fn<ReturnType<typeof useRefetch>>(async () => {});

const getRefetchMock = () => {
  const results = vi.mocked(useRefetch).mock.results;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.type === 'return') {
      return result.value as ReturnType<typeof createRefetchMock>;
    }
  }
  throw new Error('useRefetch was not called');
};

const createEnhanceFetchRscInternalMock = () =>
  vi.fn<ReturnType<typeof useEnhanceFetchRscInternal_UNSTABLE>>(() => () => {});

const getEnhanceFetchRscInternalMock = () => {
  const results = vi.mocked(useEnhanceFetchRscInternal_UNSTABLE).mock.results;
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.type === 'return') {
      return result.value as ReturnType<
        typeof createEnhanceFetchRscInternalMock
      >;
    }
  }
  throw new Error('useEnhanceFetchRscInternal_UNSTABLE was not called');
};

const getIntersectionObserverMockInstance = () => {
  const ctor = globalThis.IntersectionObserver as unknown as {
    mock?: {
      results?: Array<{
        type: string;
        value: IntersectionObserverMockInstance;
      }>;
    };
  };
  const results = ctor.mock?.results;
  if (!results) {
    throw new Error('IntersectionObserver constructor was not mocked');
  }
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index];
    if (result?.type === 'return') {
      return result.value;
    }
  }
  throw new Error('IntersectionObserver was not constructed');
};

const createMockFetchCache = (elements: ElementsMap): RouterFetchCache =>
  ({
    f: ((_: string, __: unknown, prefetchOnly?: boolean) =>
      prefetchOnly
        ? undefined
        : Promise.resolve({
            root: <Children />,
            ...elements,
          })) as RouterFetchCache['f'],
  }) as RouterFetchCache;

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    preloadModule: vi.fn(),
  };
});

vi.mock('../src/minimal/client.js', async () => {
  const actual = await vi.importActual<
    typeof import('../src/minimal/client.js')
  >('../src/minimal/client.js');

  return {
    ...actual,
    Root: vi.fn((props: Parameters<typeof actual.Root>[0]) =>
      actual.Root(props),
    ),
    prefetchRsc: vi.fn(),
    useRefetch: vi.fn(),
    useEnhanceFetchRscInternal_UNSTABLE: vi.fn(),
  };
});

const renderApp = async (element: ReactElement) => {
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
};

const flush = async () => {
  await act(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve));
  });
};

const renderRouter = async (
  props: Parameters<typeof Router>[0],
  elements: ElementsMap,
) => {
  type RouterWithFetchCacheProps = Parameters<typeof Router>[0] & {
    unstable_fetchCache?: RouterFetchCache | undefined;
  };
  const RouterWithFetchCache = Router as unknown as (
    props: RouterWithFetchCacheProps,
  ) => ReactElement;
  return renderApp(
    <RouterWithFetchCache
      {...(props || {})}
      unstable_fetchCache={createMockFetchCache(elements)}
    />,
  );
};

const renderRouterInStrictMode = async (
  props: Parameters<typeof Router>[0],
  elements: ElementsMap,
) => {
  type RouterWithFetchCacheProps = Parameters<typeof Router>[0] & {
    unstable_fetchCache?: RouterFetchCache | undefined;
  };
  const RouterWithFetchCache = Router as unknown as (
    props: RouterWithFetchCacheProps,
  ) => ReactElement;
  return renderApp(
    <StrictMode>
      <RouterWithFetchCache
        {...(props || {})}
        unstable_fetchCache={createMockFetchCache(elements)}
      />
    </StrictMode>,
  );
};

const renderWithMinimalRoot = (element: ReactElement, elements: ElementsMap) =>
  renderApp(
    <Root initialRscPath="" fetchCache={createMockFetchCache(elements)}>
      {element}
    </Root>,
  );

beforeAll(async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
  vi.unstubAllEnvs();
});

beforeEach(() => {
  window.history.replaceState({}, '', '/start');

  vi.mocked(useRefetch).mockReset();
  vi.mocked(useRefetch).mockReturnValue(createRefetchMock());
  vi.mocked(useEnhanceFetchRscInternal_UNSTABLE).mockReset();
  vi.mocked(useEnhanceFetchRscInternal_UNSTABLE).mockReturnValue(
    createEnhanceFetchRscInternalMock(),
  );
  vi.mocked(preloadModule).mockClear();
  vi.mocked(prefetchRsc).mockClear();
  vi.mocked(Root).mockClear();

  const IntersectionObserverMock = vi.fn(function (
    callback: IntersectionObserverCallback,
  ) {
    const observe = vi.fn<(target: Element) => void>();
    const disconnect = vi.fn();
    const unobserve = vi.fn<(target: Element) => void>();
    const takeRecords = vi.fn<() => IntersectionObserverEntry[]>(() => []);
    const instance: IntersectionObserverMockInstance = {
      root: null,
      rootMargin: '',
      thresholds: [],
      callback,
      observe,
      disconnect,
      unobserve,
      takeRecords,
    };
    return instance;
  });

  Object.defineProperty(globalThis, 'IntersectionObserver', {
    configurable: true,
    writable: true,
    value: IntersectionObserverMock,
  });

  delete (globalThis as Record<string, unknown>).__WAKU_ROUTER_PREFETCH__;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('router/client utilities', () => {
  test('parses route path/query/hash and normalizes trailing suffixes', () => {
    const route = unstable_parseRoute(
      new URL('http://localhost/foo/index.html?count=2#hash'),
    );
    expect(route).toEqual({
      path: '/foo',
      query: 'count=2',
      hash: '#hash',
    });

    const route2 = unstable_parseRoute(new URL('http://localhost/bar/?q=1'));
    expect(route2).toEqual({
      path: '/bar',
      query: 'q=1',
      hash: '',
    });
  });

  test('reads httpstatus meta content', () => {
    expect(unstable_getHttpStatusFromMeta()).toBeUndefined();
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'httpstatus');
    meta.setAttribute('content', '404');
    document.head.append(meta);
    expect(unstable_getHttpStatusFromMeta()).toBe('404');
  });

  test('returns deterministic route/slice slot ids', () => {
    expect(unstable_getRouteSlotId('/foo')).toBe('route:/foo');
    expect(unstable_getSliceSlotId('slice-1')).toBe('slice:slice-1');
  });

  test('ErrorBoundary renders fallback for Error and non-Error values', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const ThrowError = () => {
      throw new Error('boom');
    };
    const ThrowString = () => {
      throw 'boom-string';
    };
    try {
      const first = await renderApp(
        <ErrorBoundary>
          <ThrowError />
        </ErrorBoundary>,
      );
      expect(first.container.textContent).toContain(
        'Caught an unexpected error',
      );
      expect(first.container.textContent).toContain('Error: boom');
      first.unmount();

      const second = await renderApp(
        <ErrorBoundary>
          <ThrowString />
        </ErrorBoundary>,
      );
      expect(second.container.textContent).toContain('Error: boom-string');
      second.unmount();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

describe('useRouter + Link with context', () => {
  test('throws without RouterContext', async () => {
    const UseRouterComponent = () => {
      useRouter();
      return null;
    };
    await expect(renderApp(<UseRouterComponent />)).rejects.toThrow(
      'Missing Router',
    );
  });

  test('push/replace/reload/back/forward/prefetch call expected router actions', async () => {
    const capture = { router: null as RouterApi | null };
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const routeChangeEvents = { on: vi.fn(), off: vi.fn() };

    const Probe = () => {
      setRouter(useRouter() as unknown as RouterApi);
      return null;
    };

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          routeChangeEvents,
          fetchingSlices: new Set(),
        }}
      >
        <Probe />
      </RouterContext>,
    );

    if (!capture.router) {
      throw new Error('router was not initialized');
    }

    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    const backSpy = vi.spyOn(window.history, 'back');
    const forwardSpy = vi.spyOn(window.history, 'forward');

    await act(async () => {
      await capture.router!.push('?query=1');
      await capture.router!.replace('?query=2');
      await capture.router!.reload();
      capture.router!.back();
      capture.router!.forward();
      capture.router!.prefetch('/prefetch?x=1#h');
    });

    expect(changeRoute).toHaveBeenNthCalledWith(
      1,
      { path: '/start', query: 'query=1', hash: '' },
      { shouldScroll: false },
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      2,
      { path: '/start', query: 'query=2', hash: '' },
      { shouldScroll: false },
    );
    expect(changeRoute).toHaveBeenNthCalledWith(
      3,
      { path: '/start', query: 'query=2', hash: '' },
      { shouldScroll: true },
    );
    expect(pushStateSpy).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalled();
    expect(backSpy).toHaveBeenCalledTimes(1);
    expect(forwardSpy).toHaveBeenCalledTimes(1);
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/prefetch',
      query: 'x=1',
      hash: '#h',
    });
    expect(capture.router.unstable_events).toBe(routeChangeEvents);

    view.unmount();
  });

  test('Link intercepts normal click and skips alt/defaultPrevented clicks', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <>
          <Link to="/next">next</Link>
          <Link to="/prevented" onClick={(event) => event.preventDefault()}>
            prevented
          </Link>
        </>
      </RouterContext>,
    );

    const links = view.container.querySelectorAll('a');
    const normalClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    links[0]!.dispatchEvent(normalClick);
    await flush();

    expect(normalClick.defaultPrevented).toBe(true);
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/next',
      query: '',
      hash: '',
    });
    expect(changeRoute).toHaveBeenCalledTimes(1);
    expect(pushStateSpy).toHaveBeenCalled();

    const altClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    links[0]!.dispatchEvent(altClick);
    expect(changeRoute).toHaveBeenCalledTimes(1);

    const preventedClick = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    links[1]!.dispatchEvent(preventedClick);
    expect(changeRoute).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  test('Link currently intercepts external clicks and prevents default for unsupported cases', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const pushStateSpy = vi
      .spyOn(window.history, 'pushState')
      .mockImplementation(() => {
        return;
      });

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <>
          <Link to="https://example.com/external" data-testid="external-link">
            external
          </Link>
          <Link to="/start" data-testid="same-url-link">
            same-url
          </Link>
          <Link to="/start" target="_blank" data-testid="target-link">
            target
          </Link>
          <Link to="/start" download data-testid="download-link">
            download
          </Link>
        </>
      </RouterContext>,
    );

    const click = () =>
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      });
    const externalClick = click();
    const sameUrlClick = click();
    const targetClick = click();
    const downloadClick = click();
    view.container
      .querySelector('[data-testid="external-link"]')
      ?.dispatchEvent(externalClick);
    view.container
      .querySelector('[data-testid="same-url-link"]')
      ?.dispatchEvent(sameUrlClick);
    view.container
      .querySelector('[data-testid="target-link"]')
      ?.dispatchEvent(targetClick);
    view.container
      .querySelector('[data-testid="download-link"]')
      ?.dispatchEvent(downloadClick);
    await flush();

    expect(externalClick.defaultPrevented).toBe(true);
    expect(sameUrlClick.defaultPrevented).toBe(true);
    expect(targetClick.defaultPrevented).toBe(true);
    expect(downloadClick.defaultPrevented).toBe(true);
    expect(prefetchRoute).toHaveBeenCalledTimes(1);
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/external',
      query: '',
      hash: '',
    });
    expect(changeRoute).toHaveBeenCalledTimes(1);
    expect(changeRoute).toHaveBeenCalledWith(
      { path: '/external', query: '', hash: '' },
      expect.objectContaining({ shouldScroll: true }),
    );

    view.unmount();
    pushStateSpy.mockRestore();
  });

  test('Link handles prefetchOnEnter and prefetchOnView', async () => {
    const prefetchRoute = vi.fn();
    const onMouseEnter = vi.fn();

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute,
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Link
          to="/next"
          unstable_prefetchOnEnter
          unstable_prefetchOnView
          onMouseEnter={onMouseEnter}
        >
          next
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }

    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(prefetchRoute).toHaveBeenCalledWith({
      path: '/next',
      query: '',
      hash: '',
    });
    expect(onMouseEnter).toHaveBeenCalledTimes(1);

    const observer = getIntersectionObserverMockInstance();
    expect(observer.observe).toHaveBeenCalledWith(link);
    observer.callback(
      [
        {
          isIntersecting: true,
          target: link,
        } as unknown as IntersectionObserverEntry,
      ],
      observer,
    );
    expect(prefetchRoute).toHaveBeenCalledTimes(2);

    view.unmount();
    expect(observer.disconnect).toHaveBeenCalledTimes(1);
  });

  test('Link uses unstable_startTransition override for navigation', async () => {
    const changeRoute = vi.fn(async () => {});
    const prefetchRoute = vi.fn();
    const unstableStartTransition = vi.fn((fn: () => void) => fn());

    const view = await renderApp(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute,
          prefetchRoute,
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Link to="/next" unstable_startTransition={unstableStartTransition}>
          next
        </Link>
      </RouterContext>,
    );

    const link = view.container.querySelector('a');
    if (!link) {
      throw new Error('expected link');
    }
    link.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        button: 0,
      }),
    );
    await flush();

    expect(unstableStartTransition).toHaveBeenCalledTimes(1);
    expect(changeRoute).toHaveBeenCalledWith(
      { path: '/next', query: '', hash: '' },
      expect.objectContaining({
        unstable_startTransition: unstableStartTransition,
      }),
    );

    view.unmount();
  });

  test('Link ref supports object refs and callback cleanup', async () => {
    const contextValue = {
      route: { path: '/start', query: '', hash: '' },
      changeRoute: vi.fn(async () => {}),
      prefetchRoute: vi.fn(),
      routeChangeEvents: { on: vi.fn(), off: vi.fn() },
      fetchingSlices: new Set<string>(),
    };

    const objectRef: { current: HTMLAnchorElement | null } = { current: null };
    const callbackCleanup = vi.fn();
    const callbackRef = vi.fn(() => callbackCleanup);

    const objectView = await renderApp(
      <RouterContext value={contextValue}>
        <Link to="/next" ref={objectRef}>
          next
        </Link>
      </RouterContext>,
    );
    expect(objectRef.current?.tagName).toBe('A');
    objectView.unmount();
    expect(objectRef.current).toBeNull();

    const callbackView = await renderApp(
      <RouterContext value={contextValue}>
        <Link to="/next" ref={callbackRef}>
          next
        </Link>
      </RouterContext>,
    );
    callbackView.unmount();

    expect(callbackRef).toHaveBeenCalledTimes(1);
    expect(callbackCleanup).toHaveBeenCalledTimes(1);
  });
});

describe('Slice', () => {
  test('throws without RouterContext', async () => {
    await expect(renderApp(<Slice id="slice-1" />)).rejects.toThrow(
      'Missing Router',
    );
  });

  test('renders existing slice slot', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div data-testid="slice">slice-content</div>,
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Slice id="slice-1" />
      </RouterContext>,
      elements,
    );

    expect(view.container.textContent).toContain('slice-content');
    view.unmount();
  });

  test('lazy slice fetches once, dedupes, and clears in-flight set on completion', async () => {
    const fetchingSlices = new Set<string>();

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices,
        }}
      >
        <>
          <Slice
            id="slice-1"
            lazy
            fallback={<div data-testid="fallback-1">loading 1</div>}
          />
          <Slice
            id="slice-1"
            lazy
            fallback={<div data-testid="fallback-2">loading 2</div>}
          />
        </>
      </RouterContext>,
      {},
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loading 1');
    expect(view.container.textContent).toContain('loading 2');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith(unstable_encodeSliceId('slice-1'));
    expect(fetchingSlices.size).toBe(0);

    view.unmount();
  });

  test('lazy slice skips fetch when static element exists', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div>loaded</div>,
      [`${IS_STATIC_ID}:${slotId}`]: true,
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      elements,
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loaded');
    expect(refetch).not.toHaveBeenCalled();

    view.unmount();
  });

  test('lazy slice with existing non-static slot still refetches', async () => {
    const slotId = unstable_getSliceSlotId('slice-1');
    const elements = {
      [slotId]: <div>loaded</div>,
      [`${IS_STATIC_ID}:${slotId}`]: false,
    };

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices: new Set(),
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      elements,
    );

    const refetch = getRefetchMock();
    expect(view.container.textContent).toContain('loaded');
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith(unstable_encodeSliceId('slice-1'));

    view.unmount();
  });

  test('logs refetch failures and clears fetching set', async () => {
    const fetchingSlices = new Set<string>();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const refetch = createRefetchMock();
    refetch.mockRejectedValueOnce(new Error('slice failed'));
    vi.mocked(useRefetch).mockReturnValue(refetch);

    const view = await renderWithMinimalRoot(
      <RouterContext
        value={{
          route: { path: '/start', query: '', hash: '' },
          changeRoute: vi.fn(async () => {}),
          prefetchRoute: vi.fn(),
          routeChangeEvents: { on: vi.fn(), off: vi.fn() },
          fetchingSlices,
        }}
      >
        <Slice id="slice-1" lazy fallback={<div>fallback</div>} />
      </RouterContext>,
      {},
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to fetch slice:',
      expect.any(Error),
    );
    expect(fetchingSlices.size).toBe(0);

    view.unmount();
  });
});

describe('Router integration', () => {
  const makeProbe = (capture: { router: RouterApi | null }) => {
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const Probe = () => {
      const router = useRouter() as unknown as RouterApi;
      setRouter(router);
      return (
        <div data-testid="route-probe">
          {router.path}|{router.query}|{router.hash}
        </div>
      );
    };
    return Probe;
  };

  test('initializes Root with encoded route and query params', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', 'a=1'],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: 'a=1', hash: '#hash' },
      },
      elements,
    );

    const rootProps = vi.mocked(Root).mock.calls[0]?.[0] as
      | Parameters<typeof Root>[0]
      | undefined;
    expect(rootProps?.initialRscPath).toBe(unstable_encodeRoutePath('/start'));
    const initialParams = rootProps?.initialRscParams as
      | URLSearchParams
      | undefined;
    expect(initialParams).toBeDefined();
    expect(initialParams!.get('query')).toBe('a=1');
    expect(capture.router?.hash).toBe('#hash');

    view.unmount();
  });

  test('uses /404 as initial route when httpstatus meta is 404', async () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', 'httpstatus');
    meta.setAttribute('content', '404');
    document.head.append(meta);

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/404', ''],
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouter({}, elements);
    expect(capture.router?.path).toBe('/404');
    view.unmount();
  });

  test('push performs refetch for dynamic routes and emits start/complete events', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }
    const refetch = getRefetchMock();

    const events: string[] = [];
    capture.router.unstable_events.on('start', () => events.push('start'));
    capture.router.unstable_events.on('complete', () =>
      events.push('complete'),
    );

    await act(async () => {
      await capture.router!.push('/next?x=1#h');
    });

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(unstable_encodeRoutePath('/next'));
    const params = refetch.mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(events).toEqual(['start', 'complete']);
    expect(capture.router.path).toBe('/next');
    expect(capture.router.query).toBe('x=1');
    expect(capture.router.hash).toBe('#h');

    view.unmount();
  });

  test('push skips refetch for static routes', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }
    const refetch = getRefetchMock();

    await act(async () => {
      await capture.router!.push('/start?x=2');
    });

    expect(refetch).not.toHaveBeenCalled();
    expect(capture.router.query).toBe('x=2');

    view.unmount();
  });

  test('prefetch skips static route and preloads modules for dynamic route', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: true,
    };

    const prefetchHook = vi.fn(
      (path: string, callback: (id: string) => void) => {
        callback(`/assets/${path}.js`);
      },
    );
    (globalThis as Record<string, unknown>).__WAKU_ROUTER_PREFETCH__ =
      prefetchHook;

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    if (!capture.router) {
      throw new Error('router not initialized');
    }

    capture.router.prefetch('/start');
    expect(prefetchRsc).not.toHaveBeenCalled();

    capture.router.prefetch('/next?x=1');
    expect(prefetchRsc).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prefetchRsc).mock.calls[0]?.[0]).toBe(
      unstable_encodeRoutePath('/next'),
    );
    const params = vi.mocked(prefetchRsc).mock.calls[0]?.[1] as URLSearchParams;
    expect(params.get('query')).toBe('x=1');
    expect(prefetchHook).toHaveBeenCalledWith('/next', expect.any(Function));
    expect(preloadModule).toHaveBeenCalledWith('/assets//next.js', {
      as: 'script',
    });

    view.unmount();
  });

  test('popstate honors route interceptor return false', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/blocked')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
        unstable_routeInterceptor: () => false,
      },
      elements,
    );

    window.history.pushState({}, '', '/blocked');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(getRefetchMock()).not.toHaveBeenCalled();
    expect(capture.router?.path).toBe('/start');

    view.unmount();
  });

  test('popstate can rewrite the route via interceptor', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/intercepted')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
        unstable_routeInterceptor: () => ({
          path: '/intercepted',
          query: 'from=interceptor',
          hash: '',
        }),
      },
      elements,
    );

    window.history.pushState({}, '', '/ignored');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flush();

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/intercepted'),
      expect.any(URLSearchParams),
    );
    expect(capture.router?.path).toBe('/intercepted');
    expect(capture.router?.query).toBe('from=interceptor');

    view.unmount();
  });

  test('popstate scrolls to hash target with instant behavior for new path', async () => {
    const elements = {
      [unstable_getRouteSlotId('/start')]: <div>start</div>,
      [unstable_getRouteSlotId('/next')]: <div>next</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });
    const scrollYDescriptor = Object.getOwnPropertyDescriptor(
      window,
      'scrollY',
    );
    Object.defineProperty(window, 'scrollY', {
      configurable: true,
      value: 100,
    });
    const hashTarget = document.createElement('div');
    hashTarget.id = 'target';
    const getBoundingClientRectSpy = vi
      .spyOn(hashTarget, 'getBoundingClientRect')
      .mockReturnValue({ top: 40 } as DOMRect);
    document.body.append(hashTarget);

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      window.history.pushState({ waku_new_path: true }, '', '/next#target');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 140,
        behavior: 'instant',
      });
    } finally {
      view.unmount();
      getBoundingClientRectSpy.mockRestore();
      hashTarget.remove();
      if (scrollYDescriptor) {
        Object.defineProperty(window, 'scrollY', scrollYDescriptor);
      } else {
        Object.defineProperty(window, 'scrollY', {
          configurable: true,
          value: 0,
        });
      }
    }
  });

  test('popstate scrolls to top with auto behavior when hash target is missing', async () => {
    const elements = {
      [unstable_getRouteSlotId('/start')]: <div>start</div>,
      [unstable_getRouteSlotId('/next')]: <div>next</div>,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const scrollToSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      return;
    });

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      window.history.pushState({}, '', '/next#missing');
      window.dispatchEvent(new PopStateEvent('popstate'));
      await flush();

      expect(scrollToSpy).toHaveBeenCalledWith({
        left: 0,
        top: 0,
        behavior: 'auto',
      });
    } finally {
      view.unmount();
    }
  });

  test('enhanced fetch injects skip header and can trigger location listener route updates', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);

    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/streamed')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      foo: true,
      bar: true,
    };

    const historyPushSpy = vi.spyOn(window.history, 'pushState');

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    const enhanceFetchRscInternal = getEnhanceFetchRscInternalMock();
    const enhancer = enhanceFetchRscInternal.mock.calls[0]?.[0];
    if (!enhancer) {
      throw new Error('enhanced fetch enhancer was not registered');
    }

    const fetchSpy = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 200 }),
    );
    const baseFetchRscInternalMock = vi.fn(
      async (_rscPath, _rscParams, _prefetchOnly, fetchFn = fetch) => {
        await fetchFn('http://localhost/rsc', {});
        return {
          [ROUTE_ID]: ['/streamed', 'x=1'],
          [IS_STATIC_ID]: false,
        };
      },
    );

    const enhancedFetchRscInternal = enhancer(baseFetchRscInternalMock);

    await act(async () => {
      await enhancedFetchRscInternal(
        'R/streamed',
        undefined,
        undefined,
        fetchSpy,
      );
    });

    const requestInit = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = (requestInit?.headers ?? {}) as Record<string, string>;
    expect(headers).toBeDefined();
    expect(headers[SKIP_HEADER]).toBeTypeOf('string');
    const skipped = JSON.parse(headers[SKIP_HEADER]! as string) as string[];
    expect(skipped).toContain('foo');
    expect(skipped).toContain('bar');
    expect(capture.router?.path).toBe('/streamed');
    expect(capture.router?.query).toBe('x=1');
    expect(historyPushSpy).toHaveBeenCalled();
    expect(getRefetchMock()).not.toHaveBeenCalled();

    view.unmount();
  });

  test('location listener queues one update during in-flight refetch and applies it once', async () => {
    let resolveRefetch: (() => void) | undefined;
    const pendingRefetch = new Promise<void>((resolve) => {
      resolveRefetch = resolve;
    });
    const refetch = vi.fn(async (..._args: unknown[]) => pendingRefetch);
    vi.mocked(useRefetch).mockReturnValue(
      refetch as ReturnType<typeof useRefetch>,
    );

    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/next')]: <Probe />,
      [unstable_getRouteSlotId('/streamed')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      foo: true,
    };
    const historyPushSpy = vi.spyOn(window.history, 'pushState');

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    if (!capture.router) {
      throw new Error('router not initialized');
    }

    const enhanceFetchRscInternal = getEnhanceFetchRscInternalMock();
    const enhancer = enhanceFetchRscInternal.mock.calls[0]?.[0];
    if (!enhancer) {
      throw new Error('enhanced fetch enhancer was not registered');
    }
    const baseFetchRscInternalMock = vi.fn(async () => ({
      [ROUTE_ID]: ['/streamed', 'x=1'],
      [IS_STATIC_ID]: false,
    }));
    const enhancedFetchRscInternal = enhancer(baseFetchRscInternalMock);

    const pushPromise = capture.router.push('/next?from=push');
    await Promise.resolve();
    await act(async () => {
      await enhancedFetchRscInternal('R/streamed');
    });
    resolveRefetch?.();
    await pushPromise;
    await flush();

    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch.mock.calls[0]?.[0]).toBe(unstable_encodeRoutePath('/next'));
    const refetchParams = refetch.mock.calls[0]?.[1] as URLSearchParams;
    expect(refetchParams.get('query')).toBe('from=push');
    expect(capture.router.path).toBe('/streamed');
    expect(capture.router.query).toBe('x=1');

    const streamedPushes = historyPushSpy.mock.calls.filter((call) => {
      const target = call[2];
      const url =
        target instanceof URL
          ? target
          : new URL(String(target), window.location.origin);
      return url.pathname === '/streamed';
    });
    expect(streamedPushes).toHaveLength(1);

    view.unmount();
  });

  test('location listener route update to /404 does not push history', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const elements = {
      [unstable_getRouteSlotId('/start')]: <Probe />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      foo: true,
    };
    const historyPushSpy = vi.spyOn(window.history, 'pushState');

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    const enhanceFetchRscInternal = getEnhanceFetchRscInternalMock();
    const enhancer = enhanceFetchRscInternal.mock.calls[0]?.[0];
    if (!enhancer) {
      throw new Error('enhanced fetch enhancer was not registered');
    }
    const baseFetchRscInternalMock = vi.fn(async () => ({
      [ROUTE_ID]: ['/404', ''],
      [IS_STATIC_ID]: false,
    }));
    const enhancedFetchRscInternal = enhancer(baseFetchRscInternalMock);

    await act(async () => {
      await enhancedFetchRscInternal('R/404');
    });
    await flush();

    expect(capture.router?.path).toBe('/404');
    expect(historyPushSpy).not.toHaveBeenCalled();
    expect(getRefetchMock()).not.toHaveBeenCalled();

    view.unmount();
  });

  test('custom 404 handling without a /404 page keeps Not Found fallback', async () => {
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
    };

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    expect(view.container.textContent).toContain('Not Found');
    expect(getRefetchMock()).not.toHaveBeenCalled();

    view.unmount();
  });

  test('custom 404 handling with a /404 page triggers client navigation to /404', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
    };

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    await act(() => new Promise<void>((r) => setTimeout(r)));

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/404'),
      expect.any(URLSearchParams),
    );
    expect(capture.router?.path).toBe('/404');

    view.unmount();
  });

  test('custom 404 handling with a /404 page avoids strict-mode refetching race', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowNotFound = () => {
      throw createCustomError('not-found', { status: 404 });
    };
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowNotFound />,
      [unstable_getRouteSlotId('/404')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
      [HAS404_ID]: true,
    };

    const view = await renderRouterInStrictMode(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );

    await flush();
    try {
      expect(getRefetchMock()).toHaveBeenCalledWith(
        unstable_encodeRoutePath('/404'),
        expect.any(URLSearchParams),
      );
      expect(capture.router?.path).toBe('/404');

      const errorLogs = consoleLogSpy.mock.calls.filter(
        ([message]) => message === 'Error while navigating to 404:',
      );
      expect(errorLogs).toHaveLength(0);
    } finally {
      view.unmount();
      consoleLogSpy.mockRestore();
    }
  });

  test('redirect error triggers same-origin client navigation', async () => {
    const capture = { router: null as RouterApi | null };
    const Probe = makeProbe(capture);
    const ThrowRedirect = () => {
      throw createCustomError('redirect', { location: '/target?ok=1' });
    };

    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [unstable_getRouteSlotId('/target')]: <Probe />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    await act(() => new Promise<void>((r) => setTimeout(r)));

    expect(getRefetchMock()).toHaveBeenCalledWith(
      unstable_encodeRoutePath('/target'),
      expect.any(URLSearchParams),
    );
    expect(capture.router?.path).toBe('/target');
    expect(capture.router?.query).toBe('ok=1');
    expect(replaceStateSpy).toHaveBeenCalled();

    view.unmount();
  });

  test('redirect error with cross-origin location uses window.location.replace', async () => {
    const ThrowRedirect = () => {
      throw createCustomError('redirect', {
        location: 'https://example.com/target?ok=1',
      });
    };

    const replaceLocationSpy = vi
      .spyOn(window.location, 'replace')
      .mockImplementation(() => {});

    const elements = {
      [unstable_getRouteSlotId('/start')]: <ThrowRedirect />,
      [ROUTE_ID]: ['/start', ''],
      [IS_STATIC_ID]: false,
    };

    const view = await renderRouter(
      {
        initialRoute: { path: '/start', query: '', hash: '' },
      },
      elements,
    );
    try {
      await flush();

      expect(replaceLocationSpy).toHaveBeenCalledWith(
        'https://example.com/target?ok=1',
      );
      expect(window.location.pathname).toBe('/start');
      expect(getRefetchMock()).not.toHaveBeenCalled();
    } finally {
      view.unmount();
      replaceLocationSpy.mockRestore();
    }
  });
});

describe('INTERNAL_ServerRouter', () => {
  test('provides route and blocks client navigation APIs', async () => {
    const capture = { router: null as RouterApi | null };
    const setRouter = (router: RouterApi) => {
      capture.router = router;
    };
    const Probe = () => {
      const router = useRouter() as unknown as RouterApi;
      setRouter(router);
      return <div>{router.path}</div>;
    };

    const elementsPromise = Promise.resolve({
      root: <Children />,
      [unstable_getRouteSlotId('/server')]: <Probe />,
    });

    const view = await renderApp(
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        <INTERNAL_ServerRouter
          route={{ path: '/server', query: '', hash: '' }}
          httpstatus={200}
        />
      </INTERNAL_ServerRoot>,
    );

    expect(view.container.textContent).toContain('/server');
    expect(capture.router?.path).toBe('/server');
    await expect(capture.router!.push('/next')).rejects.toThrow(
      'changeRoute is not in the server',
    );
    expect(() => capture.router!.prefetch('/next')).toThrow(
      'prefetchRoute is not in the server',
    );
    const onResult = capture.router!.unstable_events.on(
      'start',
      () => {},
    ) as unknown as (() => never) | undefined;
    expect(typeof onResult).toBe('function');
    expect(() => onResult?.()).toThrow('routeChange:on is not in the server');
    const offResult = capture.router!.unstable_events.off(
      'start',
      () => {},
    ) as unknown as (() => never) | undefined;
    expect(typeof offResult).toBe('function');
    expect(() => offResult?.()).toThrow('routeChange:off is not in the server');

    view.unmount();
  });
});
