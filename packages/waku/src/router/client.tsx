'use client';

import {
  Component,
  createContext,
  startTransition,
  use,
  useCallback,
  useContext,
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
import { preloadModule } from 'react-dom';
import { getErrorInfo } from '../lib/utils/custom-errors.js';
import { addBase, removeBase } from '../lib/utils/path.js';
import {
  Root,
  Slot,
  prefetchRsc,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useEnhanceFetchRscInternal_UNSTABLE as useEnhanceFetchRscInternal,
  useRefetch,
} from '../minimal/client.js';
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

const getRouteUrl = (route: RouteProps): URL => {
  const nextUrl = new URL(window.location.href);
  nextUrl.pathname = route.path;
  nextUrl.search = route.query;
  nextUrl.hash = route.hash;
  return nextUrl;
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

const isAltClick = (event: MouseEvent<HTMLAnchorElement>) =>
  event.button !== 0 ||
  !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);

let savedRscParams: [query: string, rscParams: URLSearchParams] | undefined;

const createRscParams = (query: string): URLSearchParams => {
  if (savedRscParams && savedRscParams[0] === query) {
    return savedRscParams[1];
  }
  const rscParams = new URLSearchParams({ query });
  savedRscParams = [query, rscParams];
  return rscParams;
};

type ChangeRouteOptions = {
  shouldScroll: boolean;
  skipRefetch?: boolean;
  mode?: undefined | 'push' | 'replace';
  url?: URL;
  unstable_historyOnError?: boolean; // FIXME not a big fan of this hack
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
};

type ChangeRoute = (
  route: RouteProps,
  options: ChangeRouteOptions,
) => Promise<void>;

type ChangeRouteEvent = 'start' | 'complete';

type ChangeRouteCallback = (route: RouteProps) => void;

type PrefetchRoute = (route: RouteProps) => void;

type SliceId = string;

const createRouteChangeListeners = (): [
  Record<
    'on' | 'off',
    (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
  >,
  (event: ChangeRouteEvent, route: RouteProps) => void,
] => {
  const listeners: Record<ChangeRouteEvent, Set<ChangeRouteCallback>> = {
    start: new Set(),
    complete: new Set(),
  };
  const emit = (event: ChangeRouteEvent, route: RouteProps) => {
    const eventListenersSet = listeners[event];
    if (!eventListenersSet.size) {
      return;
    }
    for (const listener of eventListenersSet) {
      listener(route);
    }
  };
  return [
    {
      on: (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].add(handler);
      },
      off: (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].delete(handler);
      },
    },
    emit,
  ];
};

// This is an internal thing, not a public API
const RouterContext = createContext<{
  route: RouteProps;
  changeRoute: ChangeRoute;
  prefetchRoute: PrefetchRoute;
  routeChangeEvents: Record<
    'on' | 'off',
    (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
  >;
  fetchingSlices: Set<SliceId>;
} | null>(null);

export function useRouter() {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }

  const { route, changeRoute, prefetchRoute } = router;
  const push = useCallback(
    async (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path change (not on searchParams change)
         */
        scroll?: boolean;
      },
    ) => {
      to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
      const url = new URL(to, window.location.href);
      const currentPath = window.location.pathname;
      const newPath = url.pathname !== currentPath;
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
        mode: 'push',
        url,
      });
    },
    [changeRoute],
  );
  const replace = useCallback(
    async (
      to: InferredPaths,
      options?: {
        /**
         * indicates if the link should scroll or not on navigation
         * - `true`: always scroll
         * - `false`: never scroll
         * - `undefined`: scroll on path change (not on searchParams change)
         */
        scroll?: boolean;
      },
    ) => {
      to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
      const url = new URL(to, window.location.href);
      const currentPath = window.location.pathname;
      const newPath = url.pathname !== currentPath;
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
        mode: 'replace',
        url,
      });
    },
    [changeRoute],
  );
  const reload = useCallback(async () => {
    const url = new URL(window.location.href);
    await changeRoute(parseRoute(url), { shouldScroll: true });
  }, [changeRoute]);
  const back = useCallback(() => {
    // FIXME is this correct?
    window.history.back();
  }, []);
  const forward = useCallback(() => {
    // FIXME is this correct?
    window.history.forward();
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
    unstable_events: router.routeChangeEvents,
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
  /**
   * indicates if the link should scroll or not on navigation
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path change (not on searchParams change)
   */
  scroll?: boolean;
  unstable_pending?: ReactNode;
  unstable_notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
  unstable_prefetchOnView?: boolean;
  unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  ref?: Ref<HTMLAnchorElement> | undefined;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>;

export function Link({
  to,
  children,
  scroll,
  unstable_pending,
  unstable_notPending,
  unstable_prefetchOnEnter,
  unstable_prefetchOnView,
  unstable_startTransition,
  ref: refProp,
  ...props
}: LinkProps): ReactElement {
  to = addBase(to, import.meta.env.WAKU_CONFIG_BASE_PATH);
  const router = useContext(RouterContext);
  const changeRoute = router
    ? router.changeRoute
    : () => {
        throw new Error('Missing Router');
      };
  const prefetchRoute = router
    ? router.prefetchRoute
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const startTransitionFn =
    unstable_startTransition ||
    ((unstable_pending || unstable_notPending) && startTransition) ||
    ((fn: TransitionFunction) => fn());
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
  const internalOnClick = () => {
    const url = new URL(to, window.location.href);
    if (url.href !== window.location.href) {
      const route = parseRoute(url);
      prefetchRoute(route);
      startTransitionFn(async () => {
        const currentPath = window.location.pathname;
        const newPath = url.pathname !== currentPath;
        await changeRoute(route, {
          shouldScroll: scroll ?? newPath,
          mode: 'push',
          url,
          unstable_historyOnError: true,
          unstable_startTransition: startTransitionFn,
        });
      });
    }
  };
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.onClick) {
      props.onClick(event);
    }
    if (!event.defaultPrevented && !isAltClick(event)) {
      if (props.target && props.target.toLowerCase() !== '_self') {
        console.warn(
          '[Link] `target` is discouraged. Use `<a>` for this case.',
        );
      }
      if (props.download != null && props.download !== false) {
        console.warn(
          '[Link] `download` is discouraged. Use `<a>` for this case.',
        );
      }
      event.preventDefault();
      internalOnClick();
    }
  };
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
    <a
      {...props}
      href={to}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      ref={setRef}
    >
      {children}
    </a>
  );
  if (isPending && unstable_pending !== undefined) {
    return (
      <>
        {ele}
        {unstable_pending}
      </>
    );
  }
  if (!isPending && unstable_notPending !== undefined) {
    return (
      <>
        {ele}
        {unstable_notPending}
      </>
    );
  }
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
    if ('error' in this.state) {
      if (this.state.error instanceof Error) {
        return renderError(this.state.error.message);
      }
      return renderError(String(this.state.error));
    }
    return this.props.children;
  }
}

const NotFound = ({
  error,
  has404,
  reset,
  handledErrorSet,
}: {
  error: unknown;
  has404: boolean;
  reset: () => void;
  handledErrorSet: WeakSet<object>;
}) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    if (has404) {
      if (handledErrorSet.has(error as object)) {
        return;
      }
      handledErrorSet.add(error as object);
      const url = new URL('/404', window.location.href);
      changeRoute(parseRoute(url), { shouldScroll: true })
        .then(() => {
          reset();
        })
        .catch((err) => {
          console.log('Error while navigating to 404:', err);
        });
    }
  }, [error, has404, reset, changeRoute, handledErrorSet]);
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
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    // ensure single re-fetch per server redirection error on StrictMode
    // https://github.com/wakujs/waku/pull/1512
    if (handledErrorSet.has(error as object)) {
      return;
    }
    handledErrorSet.add(error as object);

    const url = new URL(to, window.location.href);
    // FIXME this condition seems too naive
    if (url.hostname !== window.location.hostname) {
      window.location.replace(to);
      return;
    }
    const currentPath = window.location.pathname;
    const newPath = url.pathname !== currentPath;
    changeRoute(parseRoute(url), {
      shouldScroll: newPath,
      mode: 'replace',
      url,
    })
      .then(() => {
        handledErrorSet.delete(error as object);
        // FIXME: As we understand it, we should have a proper solution.
        setTimeout(() => {
          reset();
        }, 1);
      })
      .catch((err) => {
        handledErrorSet.delete(error as object);
        console.log('Error while navigating to redirect:', err);
      });
  }, [error, to, reset, changeRoute, handledErrorSet]);
  return null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
  private handledErrorSet = new WeakSet();
  constructor(props: { has404: boolean; children?: ReactNode }) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  reset() {
    this.setState({ error: null });
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      const info = getErrorInfo(error);
      if (info?.status === 404) {
        return (
          <NotFound
            error={error}
            has404={this.props.has404}
            reset={this.reset}
            handledErrorSet={this.handledErrorSet}
          />
        );
      }
      if (info?.location) {
        return (
          <Redirect
            error={error}
            to={info.location}
            reset={this.reset}
            handledErrorSet={this.handledErrorSet}
          />
        );
      }
      throw error;
    }
    return this.props.children;
  }
}

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

const getRouteSlotId = (path: string) => 'route:' + path;
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
  const router = useContext(RouterContext);
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

const defaultRouteInterceptor = (route: RouteProps) => route;

const InnerRouter = ({
  initialRoute,
  httpStatus,
  routeInterceptor = defaultRouteInterceptor,
}: {
  initialRoute: RouteProps;
  httpStatus: string | undefined;
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined;
}) => {
  if (import.meta.hot) {
    const refetchRoute = () => {
      staticPathSetRef.current.clear();
      cachedIdSetRef.current.clear();
      const rscPath = encodeRoutePath(route.path);
      const rscParams = createRscParams(route.query);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      refetch(rscPath, rscParams);
    };
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
    const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
      globalThis.__WAKU_REFETCH_ROUTE__!,
    );
    if (index !== -1) {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRoute);
    } else {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.unshift(refetchRoute);
    }
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
  const locationListenersRef = useRef(
    new Set<(path: string, query: string) => void>(),
  );
  const locationListeners = locationListenersRef.current;
  useEffect(() => {
    const enhanceFetch =
      (fetchFn: typeof fetch) =>
      (input: RequestInfo | URL, init: RequestInit = {}) => {
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
                  requestedRouteRef.current.path !== path ||
                  (!isStatic && requestedRouteRef.current.query !== query)
                ) {
                  locationListeners.forEach((listener) =>
                    listener(path, query),
                  );
                }
              }
            })
            .catch(() => {});
          return elementsPromise as never;
        },
    );
  }, [enhanceFetchRscInternal, locationListeners]);
  const refetch = useRefetch();
  const [route, setRoute] = useState(() => ({
    // This is the first initialization of the route, and it has
    // to ignore the hash, because on server side there is none.
    // Otherwise there will be a hydration error.
    // The client side route, including the hash, will be updated in the effect below.
    ...initialRoute,
    hash: '',
  }));
  const routeChangeListenersRef = useRef<ReturnType<
    typeof createRouteChangeListeners
  > | null>(null);
  if (routeChangeListenersRef.current === null) {
    routeChangeListenersRef.current = createRouteChangeListeners();
  }
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

  const [routeChangeEvents, emitRouteChangeEvent] =
    routeChangeListenersRef.current;
  const [err, setErr] = useState<unknown>(null);
  // FIXME this "refetching" hack doesn't seem ideal.
  const refetching = useRef<[onFinish?: () => void] | null>(null);
  const changeRoute: ChangeRoute = useCallback(
    async (route, options) => {
      requestedRouteRef.current = route;
      emitRouteChangeEvent('start', route);
      const startTransitionFn =
        options.unstable_startTransition || ((fn: TransitionFunction) => fn());
      const { skipRefetch, mode, url, unstable_historyOnError } = options;
      const historyPathnameBeforeChange = window.location.pathname;
      const urlToWrite = mode && (url || getRouteUrl(route));
      const newPath = urlToWrite?.pathname
        ? urlToWrite.pathname !== historyPathnameBeforeChange
        : route.path !== historyPathnameBeforeChange;
      const writeHistoryIfNeeded = () => {
        if (
          mode &&
          urlToWrite &&
          window.location.pathname === historyPathnameBeforeChange
        ) {
          const nextState = {
            ...window.history.state,
            waku_new_path: newPath,
          };
          if (mode === 'push') {
            window.history.pushState(nextState, '', urlToWrite);
          } else {
            window.history.replaceState(nextState, '', urlToWrite);
          }
        }
      };
      refetching.current = [];
      setErr(null);
      if (!staticPathSetRef.current.has(route.path) && !skipRefetch) {
        const rscPath = encodeRoutePath(route.path);
        const rscParams = createRscParams(route.query);
        try {
          await refetch(rscPath, rscParams);
        } catch (e) {
          if (unstable_historyOnError) {
            writeHistoryIfNeeded();
          }
          refetching.current = null;
          setErr(e);
          throw e;
        }
      }
      startTransitionFn(() => {
        if (options.shouldScroll) {
          handleScroll();
        }
        setRoute(route);
        writeHistoryIfNeeded();
        refetching.current?.[0]?.();
        refetching.current = null;
        emitRouteChangeEvent('complete', route);
      });
    },
    [emitRouteChangeEvent, refetch],
  );

  const prefetchRoute: PrefetchRoute = useCallback((route) => {
    if (staticPathSetRef.current.has(route.path)) {
      return;
    }
    const rscPath = encodeRoutePath(route.path);
    const rscParams = createRscParams(route.query);
    prefetchRsc(rscPath, rscParams);
    (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(route.path, (id: string) => {
      preloadModule(id, { as: 'script' });
    });
  }, []);

  useEffect(() => {
    const callback = () => {
      const route = routeInterceptor(parseRoute(new URL(window.location.href)));
      if (!route) {
        return;
      }
      changeRoute(route, { shouldScroll: true }).catch((err) => {
        console.log('Error while navigating back:', err);
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute, routeInterceptor]);

  useEffect(() => {
    const callback = (path: string, query: string) => {
      const fn = () => {
        const url = new URL(window.location.href);
        url.pathname = path;
        url.search = query;
        url.hash = '';
        changeRoute(parseRoute(url), {
          skipRefetch: true,
          shouldScroll: false,
          mode: path === '/404' ? undefined : 'push',
          url,
        }).catch((err) => {
          console.log('Error while handling location listeners:', err);
        });
      };
      if (refetching.current) {
        refetching.current[0] = () => {
          startTransition(fn);
        };
      } else {
        startTransition(fn);
      }
    };
    locationListeners.add(callback);
    return () => {
      locationListeners.delete(callback);
    };
  }, [changeRoute, locationListeners]);

  const routeElement =
    err !== null ? (
      <ThrowError error={err} />
    ) : (
      <Slot id={getRouteSlotId(route.path)} />
    );
  const rootElement = (
    <Slot id="root">
      <meta name="httpstatus" content={httpStatus} />
      <CustomErrorHandler has404={has404}>{routeElement}</CustomErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route,
        changeRoute,
        prefetchRoute,
        routeChangeEvents,
        fetchingSlices: useRef(new Set<SliceId>()).current,
      }}
    >
      {rootElement}
    </RouterContext>
  );
};

export function Router({
  initialRoute = parseRouteFromLocation(),
  unstable_fetchCache,
  unstable_routeInterceptor,
}: {
  initialRoute?: RouteProps;
  unstable_fetchCache?: Parameters<typeof Root>[0]['fetchCache'];
  unstable_routeInterceptor?: (route: RouteProps) => RouteProps | false;
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = createRscParams(initialRoute.query);
  const httpStatus = getHttpStatusFromMeta();
  return (
    <Root
      initialRscPath={initialRscPath}
      initialRscParams={initialRscParams}
      fetchCache={unstable_fetchCache}
    >
      <InnerRouter
        initialRoute={initialRoute}
        httpStatus={httpStatus}
        routeInterceptor={unstable_routeInterceptor}
      />
    </Root>
  );
}

const MOCK_ROUTE_CHANGE_LISTENER: Record<
  'on' | 'off',
  (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
> = {
  on: () => notAvailableInServer('routeChange:on'),
  off: () => notAvailableInServer('routeChange:off'),
};

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
          routeChangeEvents: MOCK_ROUTE_CHANGE_LISTENER,
          fetchingSlices: new Set<SliceId>(),
        }}
      >
        {rootElement}
      </RouterContext>
    </>
  );
}

// Highly experimental to expose internal APIs
// Subject to change without notice
export type Unstable_RouteProps = RouteProps;
export const unstable_HAS404_ID = HAS404_ID;
export const unstable_IS_STATIC_ID = IS_STATIC_ID;
export const unstable_ROUTE_ID = ROUTE_ID;
export const unstable_SKIP_HEADER = SKIP_HEADER;
export const unstable_encodeRoutePath = encodeRoutePath;
export const unstable_encodeSliceId = encodeSliceId;
export const unstable_getRouteSlotId = getRouteSlotId;
export const unstable_getSliceSlotId = getSliceSlotId;
export const unstable_getErrorInfo = getErrorInfo;
export const unstable_addBase = addBase;
export const unstable_removeBase = removeBase;
export const unstable_RouterContext = RouterContext;
export type Unstable_ChangeRoute = ChangeRoute;
export type Unstable_ChangeRouteEvent = ChangeRouteEvent;
export type Unstable_ChangeRouteCallback = ChangeRouteCallback;
export type Unstable_PrefetchRoute = PrefetchRoute;
export type Unstable_SliceId = SliceId;
export type Unstable_InferredPaths = InferredPaths;
export const unstable_parseRoute = parseRoute;
export const unstable_getHttpStatusFromMeta = getHttpStatusFromMeta;
