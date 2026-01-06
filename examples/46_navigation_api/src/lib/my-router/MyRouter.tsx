'use client';

import {
  Component,
  createContext,
  use,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import type {
  AnchorHTMLAttributes,
  MouseEvent,
  ReactElement,
  ReactNode,
  Ref,
  RefObject,
  TransitionFunction,
} from 'react';
import {
  Root,
  Slot,
  prefetchRsc,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useEnhanceFetchRscInternal_UNSTABLE as useEnhanceFetchRscInternal,
  useRefetch,
} from 'waku/minimal/client';
import type { RouteConfig } from './base-types.js';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  SKIP_HEADER,
  encodeRoutePath,
  encodeSliceId,
} from './common.js';
import type { RouteProps } from './common.js';
import { getErrorInfo } from './custom-errors.js';
import { addBase, removeBase } from './path.js';

type AllowPathDecorators<Path extends string> = Path extends unknown
  ? Path | `${Path}?${string}` | `${Path}#${string}`
  : never;

type InferredPaths = RouteConfig extends {
  paths: infer UserPaths extends string;
}
  ? AllowPathDecorators<UserPaths>
  : string;

const normalizeRoutePath = (path: string) => {
  path = removeBase(path, import.meta.env.WAKU_CONFIG_BASE_PATH);
  for (const suffix of ['/', '/index.html']) {
    if (path.endsWith(suffix)) {
      return path.slice(0, -suffix.length) || '/';
    }
  }
  return path;
};

const parseRoute = (url: URL): RouteProps => {
  const { pathname, searchParams, hash } = url;
  return {
    path: normalizeRoutePath(pathname),
    query: searchParams.toString(),
    hash,
  };
};

const getHttpStatusFromMeta = (): string | undefined => {
  const httpStatusMeta = document.querySelector('meta[name="httpstatus"]');
  if (
    httpStatusMeta &&
    'content' in httpStatusMeta &&
    typeof httpStatusMeta.content === 'string'
  ) {
    return httpStatusMeta.content;
  }
  return undefined;
};

const parseRouteFromLocation = (): RouteProps => {
  const httpStatus = getHttpStatusFromMeta();
  if (httpStatus === '404') {
    return { path: '/404', query: '', hash: '' };
  }
  return parseRoute(new URL(window.location.href));
};

let savedRscParams: [query: string, rscParams: URLSearchParams] | undefined;

const createRscParams = (query: string): URLSearchParams => {
  if (savedRscParams && savedRscParams[0] === query) {
    return savedRscParams[1];
  }
  const rscParams = new URLSearchParams({ query });
  savedRscParams = [query, rscParams];
  return rscParams;
};

type ChangeRoute = (
  route: RouteProps,
  options: {
    shouldScroll: boolean;
    skipRefetch?: boolean;
    signal?: AbortSignal;
    unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  },
) => Promise<void>;

type PrefetchRoute = (route: RouteProps) => void;

type SliceId = string;

const PendingContext = createContext<boolean>(false);

// Not sure whether this is necessary
// We have navigation.transition
// but it's not reactive
export function usePending() {
  return use(PendingContext);
}

// This is an internal thing, not a public API
const RouterContext = createContext<{
  route: RouteProps;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  fetchingSlices: Set<SliceId>;
} | null>(null);

export function useRouter() {
  const router = use(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }

  const { route, prefetchRoute } = router;
  /**
   * @deprecated use window.navigation.navigate() instead
   */
  const push = useCallback((to: InferredPaths) => {
    to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
    window.navigation.navigate(to);
  }, []);
  /**
   * @deprecated use window.navigation.navigate() instead
   */
  const replace = useCallback((to: InferredPaths) => {
    to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
    window.navigation.navigate(to, { history: 'replace' });
  }, []);
  /**
   * @deprecated use window.navigation.reload() instead
   */
  const reload = useCallback(async () => {
    window.navigation.reload();
  }, []);
  /**
   * @deprecated use window.navigation.back() instead
   */
  const back = useCallback(() => {
    window.navigation.back();
  }, []);
  /**
   * @deprecated use window.navigation.forward() instead
   */
  const forward = useCallback(() => {
    window.navigation.forward();
  }, []);
  const prefetch = useCallback(
    (to: string) => {
      const url = new URL(to, window.location.href);
      prefetchRoute(parseRoute(url));
    },
    [prefetchRoute],
  );
  return {
    ...route,
    push,
    replace,
    reload,
    back,
    forward,
    prefetch,
  };
}

function useSharedRef<T>(
  ref: Ref<T | null> | undefined,
): [RefObject<T | null>, (node: T | null) => void | (() => void)] {
  const managedRef = useRef<T>(null);

  const handleRef = useCallback(
    (node: T | null): void | (() => void) => {
      managedRef.current = node;
      const isRefCallback = typeof ref === 'function';
      let cleanup: void | (() => void);
      if (isRefCallback) {
        cleanup = ref(node);
      } else if (ref) {
        // TODO is this a false positive?
        // eslint-disable-next-line react-hooks/immutability
        ref.current = node;
      }
      return () => {
        managedRef.current = null;
        if (isRefCallback) {
          if (cleanup) {
            cleanup();
          } else {
            ref(null);
          }
        } else if (ref) {
          ref.current = null;
        }
      };
    },
    [ref],
  );

  return [managedRef, handleRef];
}

export type LinkProps = {
  to: InferredPaths;
  children: ReactNode;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  ref: refProp,
  ...props
}: LinkProps): ReactElement {
  to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
  const router = use(RouterContext);
  const prefetchRoute = router
    ? router.prefetchRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [ref, setRef] = useSharedRef<HTMLAnchorElement>(refProp);

  useEffect(() => {
    if (unstable_prefetchOnView && ref.current) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const url = new URL(to, window.location.href);
              if (router && url.href !== window.location.href) {
                const route = parseRoute(url);
                router.prefetchRoute(route);
              }
            }
          });
        },
        { threshold: 0.1 },
      );

      observer.observe(ref.current);

      return () => {
        observer.disconnect();
      };
    }
  }, [unstable_prefetchOnView, router, to, ref]);
  const onMouseEnter = unstable_prefetchOnEnter
    ? (event: MouseEvent<HTMLAnchorElement>) => {
        const url = new URL(to, window.location.href);
        if (url.href !== window.location.href) {
          const route = parseRoute(url);
          prefetchRoute(route);
        }
        props.onMouseEnter?.(event);
      }
    : props.onMouseEnter;
  const ele = (
    <a {...props} href={to} onMouseEnter={onMouseEnter} ref={setRef}>
      {children}
    </a>
  );
  return ele;
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

function renderError(message: string) {
  return (
    <html>
      <head>
        <title>Unhandled Error</title>
      </head>
      <body
        style={{
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          placeContent: 'center',
          placeItems: 'center',
          fontSize: '16px',
          margin: 0,
        }}
      >
        <h1>Caught an unexpected error</h1>
        <p>Error: {message}</p>
      </body>
    </html>
  );
}

export class ErrorBoundary extends Component<
  { children: ReactNode; error?: unknown },
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
    if ('error' in this.state || 'error' in this.props) {
      const error = this.state.error ?? this.props.error;
      if (error instanceof Error) {
        return renderError(error.message);
      }
      return renderError(String(error));
    }
    return this.props.children;
  }
}

const NotFound = ({
  has404,
  reset,
}: {
  has404: boolean;
  reset: () => void;
}) => {
  const router = use(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    if (has404) {
      const url = new URL('/404', window.location.href);
      changeRoute(parseRoute(url), { shouldScroll: false })
        .then(() => {
          reset();
        })
        .catch((err) => {
          console.log('Error while navigating to 404:', err);
        });
    }
  }, [has404, reset, changeRoute]);
  return has404 ? null : <h1>Not Found</h1>;
};

const Redirect = ({
  error,
  to,
  reset,
  handledErrorSet,
}: {
  error: unknown;
  to: string;
  reset: () => void;
  handledErrorSet: WeakSet<object>;
}) => {
  const router = use(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  useEffect(() => {
    // ensure single re-fetch per server redirection error on StrictMode
    // https://github.com/wakujs/waku/pull/1512
    if (handledErrorSet.has(error as object)) {
      return;
    }
    handledErrorSet.add(error as object);

    const url = new URL(to, window.location.href);
    window.navigation
      .navigate(url, { history: 'replace' })
      .committed?.then(() => {
        // FIXME
        // ssr-redirect > access sync page with client navigation
        return new Promise((resolve) => setTimeout(resolve, 200));
      })
      ?.then(() => {
        console.trace('Redirected to', to);
        reset();
      });
  }, [error, handledErrorSet, reset, to]);
  return null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
  #handledErrorSet = new WeakSet();
  constructor(props: {
    has404: boolean;
    error: unknown;
    children?: ReactNode;
  }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset = () => {
    this.setState({ error: null });
  };
  render() {
    if (this.state.error !== null) {
      const info = getErrorInfo(this.state.error);
      if (info?.status === 404) {
        return <NotFound has404={this.props.has404} reset={this.reset} />;
      }
      if (info?.location) {
        return (
          <Redirect
            error={this.state.error}
            to={info.location}
            reset={this.reset}
            handledErrorSet={this.#handledErrorSet}
          />
        );
      }
      return <ErrorBoundary error={this.state.error}>{null}</ErrorBoundary>;
    }
    return this.props.children;
  }
}

const getRouteSlotId = (path: string) => 'route:' + decodeURI(path);
const getSliceSlotId = (id: SliceId) => 'slice:' + id;

export function Slice({
  id,
  children,
  ...props
}: {
  id: SliceId;
  children?: ReactNode;
} & (
  | {
      lazy?: false;
    }
  | {
      lazy: true;
      fallback: ReactNode;
    }
)) {
  const router = use(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { fetchingSlices } = router;
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice =
    props.lazy &&
    (!(slotId in elements) ||
      // FIXME: hard-coded for now
      elements[IS_STATIC_ID + ':' + slotId] !== true);
  useEffect(() => {
    // FIXME this works because of subtle timing behavior.
    if (needsToFetchSlice && !fetchingSlices.has(id)) {
      fetchingSlices.add(id);
      const rscPath = encodeSliceId(id);
      refetch(rscPath)
        .catch((e) => {
          console.error('Failed to fetch slice:', e);
        })
        .finally(() => {
          fetchingSlices.delete(id);
        });
    }
  }, [fetchingSlices, refetch, id, needsToFetchSlice]);
  if (props.lazy && !(slotId in elements)) {
    // FIXME the fallback doesn't show on refetch after the first one.
    return props.fallback;
  }
  return <Slot id={slotId}>{children}</Slot>;
}

const handleScroll = () => {
  const { hash } = window.location;
  const { state } = window.history;
  const element = hash && document.getElementById(hash.slice(1));
  window.scrollTo({
    left: 0,
    top: element ? element.getBoundingClientRect().top + window.scrollY : 0,
    behavior: state?.waku_new_path ? 'instant' : 'auto',
  });
};

const InnerRouter = ({
  initialRoute,
  httpStatus,
}: {
  initialRoute: RouteProps;
  httpStatus: string | undefined;
}) => {
  // @ts-expect-error type from vite is missing
  if (import.meta.hot) {
    const refetchRoute = () => {
      staticPathSetRef.current.clear();
      cachedIdSetRef.current.clear();
      const rscPath = encodeRoutePath(route.path);
      const rscParams = createRscParams(route.query);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      refetch(rscPath, rscParams);
    };
    // @ts-expect-error type for globalThis is missing
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
    // @ts-expect-error type for globalThis is missing
    const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
      // @ts-expect-error type for globalThis is missing
      globalThis.__WAKU_REFETCH_ROUTE__!,
    );
    if (index !== -1) {
      // @ts-expect-error type for globalThis is missing
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRoute);
    } else {
      // @ts-expect-error type for globalThis is missing
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.unshift(refetchRoute);
    }
    // @ts-expect-error type for globalThis is missing
    globalThis.__WAKU_REFETCH_ROUTE__ = refetchRoute;
  }

  const elementsPromise = useElementsPromise();
  const [has404, setHas404] = useState(false);
  const requestedRouteRef = useRef<RouteProps>(initialRoute);
  const staticPathSetRef = useRef(new Set<string>());
  const cachedIdSetRef = useRef(new Set<string>());
  useEffect(() => {
    elementsPromise.then(
      (elements) => {
        const {
          [ROUTE_ID]: routeData,
          [IS_STATIC_ID]: isStatic,
          [HAS404_ID]: has404FromElements,
          ...rest
        } = elements;
        if (has404FromElements) {
          setHas404(true);
        }
        if (routeData) {
          const [path, _query] = routeData as [string, string];
          if (isStatic) {
            staticPathSetRef.current.add(path);
          }
        }
        cachedIdSetRef.current = new Set(Object.keys(rest));
      },
      () => {},
    );
  }, [elementsPromise]);

  const enhanceFetchRscInternal = useEnhanceFetchRscInternal();
  // It doesn't have to be a ref
  // But passing it to multiple function calls is too complicated
  const signalRef = useRef<AbortSignal | null>(null);
  useEffect(() => {
    const enhanceFetch =
      (fetchFn: typeof fetch) =>
      (
        input: RequestInfo | URL,
        init: RequestInit = { signal: signalRef.current },
      ) => {
        const skipStr = JSON.stringify(Array.from(cachedIdSetRef.current));
        const headers = (init.headers ||= {});
        if (Array.isArray(headers)) {
          headers.push([SKIP_HEADER, skipStr]);
        } else {
          (headers as Record<string, string>)[SKIP_HEADER] = skipStr;
        }
        return fetchFn(input, init);
      };
    return enhanceFetchRscInternal(
      (fetchRscInternal) =>
        (
          rscPath: string,
          rscParams: unknown,
          prefetchOnly,
          fetchFn = fetch,
        ) => {
          const enhancedFetch = enhanceFetch(fetchFn);
          type Elements = Record<string, unknown>;
          const elementsPromise = fetchRscInternal(
            rscPath,
            rscParams,
            prefetchOnly as undefined,
            enhancedFetch,
          ) as Promise<Elements> | undefined;
          Promise.resolve(elementsPromise)
            .then((elements = {}) => {
              const { [ROUTE_ID]: routeData, [IS_STATIC_ID]: isStatic } =
                elements;
              if (routeData) {
                const [path, query] = routeData as [string, string];
                if (
                  requestedRouteRef.current.path !== encodeURI(path) ||
                  (!isStatic && requestedRouteRef.current.query !== query)
                ) {
                  // redirected
                  window.navigation.navigate(path, { history: 'replace' });
                }
              }
            })
            .catch(() => {});
          return elementsPromise as never;
        },
    );
  }, [enhanceFetchRscInternal]);
  const refetch = useRefetch();
  const [route, setRoute] = useState(() => ({
    // This is the first initialization of the route, and it has
    // to ignore the hash, because on server side there is none.
    // Otherwise there will be a hydration error.
    // The client side route, including the hash, will be updated in the effect below.
    ...initialRoute,
    hash: '',
  }));

  // Update the route post-load to include the current hash.
  useEffect(() => {
    setRoute((prev) => {
      if (
        prev.path === initialRoute.path &&
        prev.query === initialRoute.query &&
        prev.hash === initialRoute.hash
      ) {
        return prev;
      }
      return initialRoute;
    });
  }, [initialRoute]);

  const customErrorHandlerRef = useRef<CustomErrorHandler>(null);
  const changeRoute: ChangeRoute = useCallback(
    async (route, options) => {
      requestedRouteRef.current = route;
      const startTransitionFn =
        options.unstable_startTransition || ((fn: TransitionFunction) => fn());
      customErrorHandlerRef.current?.reset();
      const { skipRefetch } = options || {};
      if (!staticPathSetRef.current.has(route.path) && !skipRefetch) {
        const rscPath = encodeRoutePath(route.path);
        const rscParams = createRscParams(route.query);
        try {
          await refetch(rscPath, rscParams);
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            // Noop
          } else {
            // Workaround: after setErr, CustomErrorHandler is not rerendered!
            // Why is that?
            // Luckily this is not on happy path.
            // Update: this causes more bugs.
            // flushSync(() => {
            // });
            throw e;
          }
        }
      }
      startTransitionFn(() => {
        if (!options.signal?.aborted) {
          if (options.shouldScroll) {
            handleScroll();
          }
          setRoute(route);
        }
      });
    },
    [refetch],
  );

  const prefetchRoute: PrefetchRoute = useCallback((route) => {
    if (staticPathSetRef.current.has(route.path)) {
      return;
    }
    const rscPath = encodeRoutePath(route.path);
    const rscParams = createRscParams(route.query);
    prefetchRsc(rscPath, rscParams);
    (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(route.path);
  }, []);

  const [isPending, startTransition] = useTransition();

  // https://github.com/facebook/react/blob/main/fixtures/view-transition/src/components/App.js
  useEffect(() => {
    const callback = (event: NavigateEvent) => {
      if (
        !event.canIntercept ||
        // If this is a download,
        // let the browser perform the download.
        event.downloadRequest ||
        // If this is a form submission,
        // let that go to the server.
        event.formData
      ) {
        return;
      } else if (
        // If this is just a hashChange,
        // just let the browser handle scrolling to the content.
        event.hashChange
      ) {
        setRoute((prev) => ({
          ...prev,
          hash: new URL(event.destination.url).hash,
        }));
        return;
      }
      const url = new URL(event.destination.url);
      const route = parseRoute(url);
      // console.log(event);
      const navigationType = event.navigationType;
      // @ts-expect-error not supported yet
      const previousIndex = window.navigation.currentEntry.index;
      event.intercept({
        // @ts-expect-error not supported yet
        async precommitHandler() {
          if (signalRef.current) {
            // It happens when click very fast.
            console.warn('Potential race condition due to rapid navigation.');
          }
          signalRef.current = event.signal;
          startTransition(async () => {
            // addTransitionType('navigation-' + navigationType);
            if (navigationType === 'traverse') {
              // For traverse types it's useful to distinguish going back or forward.
              const nextIndex = event.destination.index;
              if (nextIndex > previousIndex) {
                // addTransitionType('navigation-forward');
              } else if (nextIndex < previousIndex) {
                // addTransitionType('navigation-back');
              }
              const err = customErrorHandlerRef.current?.state.error;
              if (err) {
                const info = getErrorInfo(err);
                if (info?.status === 404) {
                  // if 404 sans 404.tsx, manually go back
                  // should make CustomErrorHandler state
                  // Haha, upstream is broken too

                  customErrorHandlerRef.current?.reset();
                }
              }
              await changeRoute(route, {
                shouldScroll: false,
                unstable_startTransition: startTransition,
                signal: event.signal,
              }).catch((err) => {
                console.log('Error while navigating back:', err);
              });
            } else {
              prefetchRoute(route);
              try {
                await changeRoute(route, {
                  shouldScroll: false,
                  unstable_startTransition: startTransition,
                  signal: event.signal,
                });
              } catch (err) {
                // Handle 404, etc here
                customErrorHandlerRef.current?.setState({ error: err });
                if (has404 && err) {
                  const info = getErrorInfo(err);
                  if (info?.status === 404) {
                    await changeRoute(
                      { path: '/404', query: '', hash: '' },
                      {
                        signal: event.signal,
                        shouldScroll: false,
                      },
                    );
                  }
                }
              }
            }
            if (signalRef.current === event.signal) {
              signalRef.current = null;
            }
          });
          await flushAsync();
          return;
        },
        scroll: 'after-transition',
      });
    };
    window.navigation.addEventListener('navigate', callback);
    return () => {
      window.navigation.removeEventListener('navigate', callback);
    };
  }, [changeRoute, prefetchRoute, has404]);

  // run after new route DOM mounted
  useEffect(() => {
    resolver.current?.(undefined);
    resolver.current = null;
  }, [route, customErrorHandlerRef.current?.state.error]);

  const resolver = useRef<((value: undefined) => void) | null>(null);

  async function flushAsync() {
    const deferred = Promise.withResolvers();
    resolver.current = deferred.resolve;
    await deferred.promise;
    return;
  }

  const routeElement = <Slot id={getRouteSlotId(route.path)} />;
  const rootElement = (
    <Slot id="root">
      <meta name="httpstatus" content={httpStatus} />
      <CustomErrorHandler ref={customErrorHandlerRef} has404={has404}>
        {routeElement}
      </CustomErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route,
        changeRoute,
        prefetchRoute,
        fetchingSlices: useRef(new Set<SliceId>()).current,
      }}
    >
      <PendingContext value={isPending}>{rootElement}</PendingContext>
    </RouterContext>
  );
};

export function Router({
  initialRoute = parseRouteFromLocation(),
}: {
  initialRoute?: RouteProps;
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = createRscParams(initialRoute.query);
  const httpStatus = getHttpStatusFromMeta();
  return (
    <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
      <InnerRouter initialRoute={initialRoute} httpStatus={httpStatus} />
    </Root>
  );
}

/**
 * ServerRouter for SSR
 * This is not a public API.
 */
export function INTERNAL_ServerRouter({
  route,
  httpstatus,
}: {
  route: RouteProps;
  httpstatus: number;
}) {
  const routeElement = <Slot id={getRouteSlotId(route.path)} />;
  const rootElement = (
    <Slot id="root">
      <meta name="httpstatus" content={`${httpstatus}`} />
      {routeElement}
    </Slot>
  );
  return (
    <>
      <RouterContext
        value={{
          route,
          changeRoute: notAvailableInServer('changeRoute'),
          prefetchRoute: notAvailableInServer('prefetchRoute'),
          fetchingSlices: new Set<SliceId>(),
        }}
      >
        {rootElement}
      </RouterContext>
    </>
  );
}
