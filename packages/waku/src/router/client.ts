'use client';

import {
  createContext,
  createElement,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  Fragment,
  Component,
} from 'react';
import type {
  ComponentProps,
  FunctionComponent,
  ReactNode,
  AnchorHTMLAttributes,
  ReactElement,
  MouseEvent,
  TransitionFunction,
  RefObject,
  Ref,
} from 'react';

import {
  prefetchRsc,
  Root,
  Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useRefetch,
  useEnhanceFetchRscInternal_UNSTABLE as useEnhanceFetchRscInternal,
} from '../minimal/client.js';
import {
  encodeRoutePath,
  encodeSliceId,
  ROUTE_ID,
  IS_STATIC_ID,
  HAS404_ID,
  SKIP_HEADER,
} from './common.js';
import type { RouteProps } from './common.js';
import type { RouteConfig } from './base-types.js';
import { getErrorInfo } from '../lib/utils/custom-errors.js';

type AllowPathDecorators<Path extends string> = Path extends unknown
  ? Path | `${Path}?${string}` | `${Path}#${string}`
  : never;

type InferredPaths = RouteConfig extends {
  paths: infer UserPaths extends string;
}
  ? AllowPathDecorators<UserPaths>
  : string;

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const normalizeRoutePath = (path: string) => {
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

const parseRouteFromLocation = (): RouteProps => {
  const httpStatusMeta = document.querySelector('meta[name="httpstatus"]');
  if (
    httpStatusMeta &&
    'content' in httpStatusMeta &&
    httpStatusMeta.content === '404'
  ) {
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

type ChangeRoute = (
  route: RouteProps,
  options: {
    shouldScroll: boolean;
    skipRefetch?: boolean;
    unstable_startTransition?: ((fn: TransitionFunction) => void) | undefined;
  },
) => Promise<void>;

type ChangeRouteEvent = 'start' | 'complete';

type ChangeRouteCallback = (route: RouteProps) => void;

type PrefetchRoute = (route: RouteProps) => void;

type SliceId = string;

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
      const url = new URL(to, window.location.href);
      const currentPath = window.location.pathname;
      const newPath = url.pathname !== currentPath;
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
      });
      if (window.location.pathname === currentPath) {
        window.history.pushState(
          {
            ...window.history.state,
            waku_new_path: newPath,
          },
          '',
          url,
        );
      }
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
      const url = new URL(to, window.location.href);
      const currentPath = window.location.pathname;
      const newPath = url.pathname !== currentPath;
      await changeRoute(parseRoute(url), {
        shouldScroll: options?.scroll ?? newPath,
      });
      if (window.location.pathname === currentPath) {
        window.history.replaceState(window.history.state, '', url);
      }
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
        try {
          await changeRoute(route, {
            shouldScroll: scroll ?? newPath,
            unstable_startTransition: startTransitionFn,
          });
        } catch (err) {
          console.error('Error while navigating to new route:', err);
          throw err;
        } finally {
          if (window.location.pathname === currentPath) {
            // Update history if it wasn't already updated
            window.history.pushState(
              {
                ...window.history.state,
                waku_new_path: newPath,
              },
              '',
              url,
            );
          }
        }
      });
    }
  };
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (props.onClick) {
      props.onClick(event);
    }
    if (!event.defaultPrevented && !isAltClick(event)) {
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
  const ele = createElement(
    'a',
    { ...props, href: to, onClick, onMouseEnter, ref: setRef },
    children,
  );
  if (isPending && unstable_pending !== undefined) {
    return createElement(Fragment, null, ele, unstable_pending);
  }
  if (!isPending && unstable_notPending !== undefined) {
    return createElement(Fragment, null, ele, unstable_notPending);
  }
  return ele;
}

const notAvailableInServer = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

function renderError(message: string) {
  return createElement(
    'html',
    null,
    createElement('body', null, createElement('h1', null, message)),
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
  has404,
  reset,
}: {
  has404: boolean;
  reset: () => void;
}) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    if (has404) {
      const url = new URL('/404', window.location.href);
      changeRoute(parseRoute(url), { shouldScroll: true })
        .then(() => {
          // HACK: This timeout is required for canary-ci to work
          // FIXME: As we understand it, we should have a proper solution.
          setTimeout(() => {
            reset();
          }, 1);
        })
        .catch((err) => {
          console.log('Error while navigating to 404:', err);
        });
    }
  }, [has404, reset, changeRoute]);
  return has404 ? null : createElement('h1', null, 'Not Found');
};

const Redirect = ({ to, reset }: { to: string; reset: () => void }) => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { changeRoute } = router;
  useEffect(() => {
    const url = new URL(to, window.location.href);
    // FIXME this condition seems too naive
    if (url.hostname !== window.location.hostname) {
      window.location.replace(to);
      return;
    }
    const currentPath = window.location.pathname;
    const newPath = url.pathname !== currentPath;
    changeRoute(parseRoute(url), { shouldScroll: newPath })
      .then(() => {
        // FIXME: As we understand it, we should have a proper solution.
        setTimeout(() => {
          reset();
        }, 1);
      })
      .catch((err) => {
        console.log('Error while navigating to redirect:', err);
      })
      .finally(() => {
        if (window.location.pathname === currentPath) {
          window.history.replaceState(
            {
              ...window.history.state,
              waku_new_path: newPath,
            },
            '',
            url,
          );
        }
      });
  }, [to, reset, changeRoute]);
  return null;
};

class CustomErrorHandler extends Component<
  { has404: boolean; children?: ReactNode },
  { error: unknown | null }
> {
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
        return createElement(NotFound, {
          has404: this.props.has404,
          reset: this.reset,
        });
      }
      if (info?.location) {
        return createElement(Redirect, {
          to: info.location,
          reset: this.reset,
        });
      }
      throw error;
    }
    return this.props.children;
  }
}

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

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
      delayed?: false;
    }
  | {
      delayed: true;
      fallback: ReactNode;
    }
)) {
  if (
    typeof window !== 'undefined' &&
    !import.meta.env?.VITE_EXPERIMENTAL_WAKU_ROUTER
  ) {
    throw new Error('Slice is still experimental');
  }
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  const { fetchingSlices } = router;
  const refetch = useRefetch();
  const slotId = getSliceSlotId(id);
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const needsToFetchSlice = props.delayed && !(slotId in elements);
  useEffect(() => {
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
  if (needsToFetchSlice) {
    return props.fallback;
  }
  return createElement(Slot, { id: slotId }, children);
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

const InnerRouter = ({ initialRoute }: { initialRoute: RouteProps }) => {
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
  const routeChangeListenersRef =
    useRef<
      [
        Record<
          'on' | 'off',
          (event: ChangeRouteEvent, handler: ChangeRouteCallback) => void
        >,
        (
          eventType: ChangeRouteEvent,
          eventRoute: Parameters<ChangeRouteCallback>[0],
        ) => void,
      ]
    >(null);
  if (routeChangeListenersRef.current === null) {
    const listeners: Record<ChangeRouteEvent, Set<ChangeRouteCallback>> = {
      start: new Set(),
      complete: new Set(),
    };
    const executeListeners = (
      eventType: ChangeRouteEvent,
      eventRoute: Parameters<ChangeRouteCallback>[0],
    ) => {
      const eventListenersSet = listeners[eventType];
      if (!eventListenersSet.size) {
        return;
      }
      for (const listener of eventListenersSet) {
        listener(eventRoute);
      }
    };
    const events = (() => {
      const on = (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].add(handler);
      };
      const off = (event: ChangeRouteEvent, handler: ChangeRouteCallback) => {
        listeners[event].delete(handler);
      };
      return { on, off };
    })();

    routeChangeListenersRef.current = [events, executeListeners];
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

  const [routeChangeEvents, executeListeners] = routeChangeListenersRef.current;
  const [err, setErr] = useState<unknown>(null);
  // FIXME this "refetching" hack doesn't seem ideal.
  const refetching = useRef<[onFinish?: () => void] | null>(null);
  const changeRoute: ChangeRoute = useCallback(
    async (route, options) => {
      requestedRouteRef.current = route;
      executeListeners('start', route);
      const startTransitionFn =
        options.unstable_startTransition || ((fn: TransitionFunction) => fn());
      refetching.current = [];
      setErr(null);
      const { skipRefetch } = options || {};
      if (!staticPathSetRef.current.has(route.path) && !skipRefetch) {
        const rscPath = encodeRoutePath(route.path);
        const rscParams = createRscParams(route.query);
        try {
          await refetch(rscPath, rscParams);
        } catch (e) {
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
        refetching.current![0]?.();
        refetching.current = null;
        executeListeners('complete', route);
      });
    },
    [executeListeners, refetch],
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

  useEffect(() => {
    const callback = () => {
      const route = parseRoute(new URL(window.location.href));
      changeRoute(route, { shouldScroll: true }).catch((err) => {
        console.log('Error while navigating back:', err);
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute]);

  useEffect(() => {
    const callback = (path: string, query: string) => {
      const fn = async () => {
        const url = new URL(window.location.href);
        url.pathname = path;
        url.search = query;
        url.hash = '';
        try {
          await changeRoute(parseRoute(url), {
            skipRefetch: true,
            shouldScroll: false,
          });
        } finally {
          if (path !== '/404') {
            window.history.pushState(
              {
                ...window.history.state,
                waku_new_path: url.pathname !== window.location.pathname,
              },
              '',
              url,
            );
          }
        }
      };
      if (refetching.current) {
        refetching.current.push(fn);
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
    err !== null
      ? createElement(ThrowError, { error: err })
      : createElement(Slot, { id: getRouteSlotId(route.path) });
  const rootElement = createElement(
    Slot,
    { id: 'root' },
    createElement(CustomErrorHandler, { has404 }, routeElement),
  );
  return createElement(
    RouterContext,
    {
      value: {
        route,
        changeRoute,
        prefetchRoute,
        routeChangeEvents,
        fetchingSlices: useRef(new Set<SliceId>()).current,
      },
    },
    rootElement,
  );
};

export function Router({
  initialRoute = parseRouteFromLocation(),
}: {
  initialRoute?: RouteProps;
}) {
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = createRscParams(initialRoute.query);
  return createElement(
    Root as FunctionComponent<Omit<ComponentProps<typeof Root>, 'children'>>,
    {
      initialRscPath,
      initialRscParams,
    },
    createElement(InnerRouter, { initialRoute }),
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
  const routeElement = createElement(Slot, { id: getRouteSlotId(route.path) });
  const rootElement = createElement(
    Slot,
    { id: 'root' },
    createElement('meta', { name: 'httpstatus', content: `${httpstatus}` }),
    routeElement,
  );
  return createElement(
    Fragment,
    null,
    createElement(
      RouterContext,
      {
        value: {
          route,
          changeRoute: notAvailableInServer('changeRoute'),
          prefetchRoute: notAvailableInServer('prefetchRoute'),
          routeChangeEvents: MOCK_ROUTE_CHANGE_LISTENER,
          fetchingSlices: new Set<SliceId>(),
        },
      },
      rootElement,
    ),
  );
}
