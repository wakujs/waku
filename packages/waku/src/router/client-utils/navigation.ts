import {
  startTransition,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  unstable_combineElements as combineElements,
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from 'waku/minimal/client';
import { useRouterCache } from '../client-core-utils/caches.js';
import { isFollowable } from '../client-core-utils/error-route.js';
import { useHmrRefetch } from '../client-core-utils/hmr.js';
import { useInitialRoute } from '../client-core-utils/initial-route.js';
import {
  getRouteUrl,
  isSameRoute,
  isSameRscRoute,
  parseRoute,
} from '../client-core-utils/route-url.js';
import type { ServerFunctionRouting } from '../client-core-utils/server-function-routing.js';
import { useServerFunctionRouting } from '../client-core-utils/server-function-routing.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteFromElements,
  getRouteSlotId,
  has404FromElements,
  isMetaKey,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import {
  canPaintInstantOverlay,
  useStartInstantPaint,
} from './instant-navigation.js';
import { dispatchChangeRoute } from './router-context.js';
import type { ChangeRoute, ChangeRouteOptions } from './router-context.js';
import {
  ROUTER_STATE_ID,
  getInstantSlotIds,
  getRouterState,
  makeRouterState,
  resolveServerRedirect,
  getSettledRoute as resolveSettledRoute,
} from './router-state.js';
import type { RouterState } from './router-state.js';
import { scrollToHash, shouldScrollForRouteChange } from './scroll.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type HistoryIntent = ChangeRouteOptions['history'];

type NavigationAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

type NavigationError = { error: unknown };

type NavigationRequest = {
  controller: AbortController;
  target: Pick<RouteProps, 'path' | 'query'>;
  base: Elements;
  queuedState?: RouterState;
};

type Navigation = {
  route: RouteProps;
  changeRoute: ChangeRoute;
  getElements: () => Elements;
  error: NavigationError | undefined;
};

const commitHistory = (url: URL, mode: HistoryIntent): void => {
  if (window.location.href === url.href) {
    return;
  }
  if (mode === 'push') {
    window.history.pushState(window.history.state, '', url);
    return;
  }
  window.history.replaceState(window.history.state, '', url);
};

const reloadWithUrl = (url: URL) => {
  window.history.pushState(window.history.state, '', url);
  window.location.reload();
};

export const useNavigation = (
  elements: Elements,
  fallbackRoute: RouteProps,
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined,
  serverFunctionRouting: ServerFunctionRouting,
): Navigation => {
  const cache = useRouterCache();
  const initialRoute = useInitialRoute(fallbackRoute);
  const has404 = has404FromElements(elements);
  const initialElementsRef = useRef(elements);
  useEffect(() => {
    cache.learnStaticFromElements(initialElementsRef.current);
  }, [cache]);

  const committedElementsRef = useRef(elements);
  useLayoutEffect(() => {
    committedElementsRef.current = elements;
  }, [elements]);
  const getElements = useCallback(() => committedElementsRef.current, []);

  const startInstantPaint = useStartInstantPaint(getElements, reloadWithUrl);
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const [navigationError, setNavigationError] = useState<NavigationError>();
  useEffect(() => {
    if (import.meta.hot) {
      // Router owns the HMR target; replace Minimal's initial-path listener.
      registerRscReloadListener(() => {}, { replace: true });
    }
  }, [registerRscReloadListener]);

  const routerState = getRouterState(elements);
  const destination = useMemo(
    () =>
      routerState &&
      resolveServerRedirect(elements, routerState, initialRoute.path),
    [elements, routerState, initialRoute],
  );
  const route = destination ? destination.route : initialRoute;
  const requestRef = useRef<NavigationRequest>(undefined);
  const appliedRef = useRef<{ state: RouterState; href: string }>(undefined);
  const destinationHref = destination?.url.href;
  const currentHash = route.hash;
  useLayoutEffect(() => {
    if (
      routerState &&
      requestRef.current?.queuedState === routerState &&
      !getInstantSlotIds(elements)
    ) {
      if (!routerState.failedFrom) {
        cache.learnStaticFromElements(elements);
      }
      requestRef.current = undefined;
    }
    if (!routerState || !destinationHref) {
      return;
    }
    const originalState = routerState.originalState ?? routerState;
    const applied = appliedRef.current?.state === originalState;
    if (!applied || appliedRef.current?.href !== destinationHref) {
      commitHistory(
        new URL(destinationHref),
        applied ? 'replace' : routerState.history,
      );
    }
    appliedRef.current = { state: originalState, href: destinationHref };
    if (applied || !routerState.scroll) {
      return;
    }
    const { pathChanged } = routerState.scroll;
    scrollToHash(currentHash, pathChanged ? 'instant' : 'auto', pathChanged);
  }, [cache, elements, routerState, destinationHref, currentHash]);

  const replaceRequest = useCallback((next?: NavigationRequest) => {
    const superseded = requestRef.current;
    requestRef.current = next;
    if (superseded && !superseded.queuedState) {
      superseded.controller.abort();
    }
  }, []);

  const getSettledRoute = useCallback(
    () => resolveSettledRoute(getElements(), initialRoute),
    [getElements, initialRoute],
  );
  const getRefetchRoute = useCallback(() => {
    const request = requestRef.current;
    return request?.queuedState && !request.queuedState.failedFrom
      ? resolveSettledRoute(request.base, initialRoute)
      : getSettledRoute();
  }, [getSettledRoute, initialRoute]);
  useHmrRefetch({
    getSettledRoute: getRefetchRoute,
    onBeforeRefetch: replaceRequest,
  });

  const changeRoute: ChangeRoute = useCallback(
    async function changeRoute(nextRoute, options) {
      const elements = getElements();
      const settledRoute =
        getRouterState(elements)?.failedFrom ??
        resolveSettledRoute(elements, initialRoute);
      const retainedElements = requestRef.current?.base;
      const base = retainedElements ?? elements;
      let responseFallback: Elements | undefined;
      const mergeWithCachedRoute = (
        prevPromise: Promise<Elements>,
        patchPromise: Promise<Elements>,
      ) =>
        Promise.all([prevPromise, patchPromise]).then(([prev, patch]) => {
          const route = getRouteFromElements(patch);
          const slotId = route && getRouteSlotId(route.path);
          const represented = getInstantSlotIds(prev);
          let available =
            responseFallback && represented
              ? combineElements(prev, responseFallback, {
                  filter: (key) =>
                    typeof key === 'string' &&
                    !represented.has(key) &&
                    !Object.hasOwn(prev, key),
                })
              : prev;
          const cachedElements =
            slotId && responseFallback && slotId in responseFallback
              ? responseFallback
              : base;
          if (slotId && !(slotId in available) && slotId in cachedElements) {
            available = combineElements(available, cachedElements, {
              filter: (key) => key === slotId,
            });
          }
          return combineElements(available, patch);
        });
      const loadedRoute =
        getRouterState(base)?.failedFrom ??
        (retainedElements && getRouteFromElements(retainedElements)) ??
        settledRoute;
      const shouldRefetch =
        options.refetch ??
        (!isSameRscRoute(nextRoute, settledRoute) ||
          !isSameRscRoute(
            nextRoute,
            getRouteFromElements(base) ?? settledRoute,
          ));
      const canReuseStatic = cache.canReuseStaticRoute(nextRoute, base);
      if (
        options.pendingTransition &&
        shouldRefetch &&
        !canReuseStatic &&
        !canPaintInstantOverlay(
          cache,
          options.follows ?? 0,
          nextRoute,
          getElements(),
        )
      ) {
        const schedule = options.pendingTransition;
        return new Promise<void>((resolve, reject) => {
          schedule(async () => {
            try {
              await changeRoute(nextRoute, {
                ...options,
                pendingTransition: undefined,
              });
              resolve();
            } catch (e) {
              reject(e);
            }
          });
        });
      }
      const controller = new AbortController();
      const request: NavigationRequest = {
        controller,
        target: nextRoute,
        base,
      };
      controller.signal.addEventListener('abort', () => {
        if (requestRef.current) {
          options.onSuperseded?.();
        }
      });
      replaceRequest(request);
      if (requestRef.current !== request) {
        return;
      }
      setNavigationError(undefined);
      const finishRequest = () => {
        if (requestRef.current === request) {
          requestRef.current = undefined;
        }
      };
      if (import.meta.hot) {
        registerRscReloadListener(() => {}, { replace: true });
      }
      const routeUrl = options.url ?? getRouteUrl(nextRoute);
      const initialAttempt: NavigationAttempt = {
        route: nextRoute,
        url: routeUrl,
        follows: options.follows ?? 0,
      };
      const requestedPathChanged =
        initialAttempt.route.path !== settledRoute.path;
      const makeStateForAttempt = (
        attempt: NavigationAttempt,
        history: HistoryIntent,
      ): RouterState =>
        makeRouterState(attempt.route, attempt.url, {
          history,
          scroll: options.shouldScroll,
          pathChanged:
            requestedPathChanged || attempt.route.path !== settledRoute.path,
          follows: attempt.follows,
        });
      const initialState = makeStateForAttempt(initialAttempt, options.history);
      if (canReuseStatic || !shouldRefetch) {
        const routePatch = {
          [ROUTE_ID]: [nextRoute.path, nextRoute.query],
          ...(canReuseStatic ? { [IS_STATIC_ID]: true } : {}),
        };
        request.queuedState = initialState;
        const patch = combineElements(routePatch, {
          [ROUTER_STATE_ID]: initialState,
        });
        request.base =
          options.refetch === false ? patch : combineElements(base, patch);
        void mergeElements(patch, mergeWithCachedRoute);
        return;
      }
      const initialFollows = options.follows ?? 0;
      const instantResponse = options.instant
        ? startInstantPaint(initialAttempt, initialState, controller.signal)
        : undefined;
      const instantBase = instantResponse
        ? cache.getPrefetchedElements(nextRoute)
        : undefined;
      const loadPatch = async (): Promise<Elements> => {
        const outcome = await cache.load(nextRoute, {
          signal: controller.signal,
          refetch: shouldRefetch,
          has404,
          settled: loadedRoute,
          base,
          url: routeUrl,
          follows: initialFollows,
          onBuildIdMismatch: reloadWithUrl,
          onInvalidate: (url) => {
            if (!controller.signal.aborted) {
              reloadWithUrl(url);
            }
          },
          ...(instantResponse ? { adopt: instantResponse } : {}),
        });
        if (outcome.type === 'aborted' || requestRef.current !== request) {
          return {};
        }
        const historyIntent =
          instantResponse &&
          outcome.follows > initialFollows &&
          options.history !== null
            ? 'replace'
            : options.history;
        if (outcome.type === 'external') {
          commitHistory(outcome.from, historyIntent);
          finishRequest();
          window.location.replace(outcome.url.href);
          throw outcome.error;
        }
        if (outcome.type === 'failed') {
          const { error } = outcome;
          commitHistory(outcome.url, historyIntent);
          const failureState: RouterState = {
            ...makeRouterState(outcome.route, outcome.url, {
              history: null,
              scroll: false,
              pathChanged: false,
              follows: outcome.follows,
            }),
            failedFrom: loadedRoute,
          };
          const patch = {
            ...(instantResponse
              ? {
                  [ROUTE_ID]: base[ROUTE_ID],
                  [IS_STATIC_ID]: base[IS_STATIC_ID],
                }
              : {}),
            [ROUTER_STATE_ID]: failureState,
          };
          request.queuedState = failureState;
          const baseRoute = resolveSettledRoute(base, initialRoute);
          request.base = combineElements(base, {
            ...patch,
            [ROUTE_ID]: [baseRoute.path, baseRoute.query],
          });
          startTransition(() => {
            void mergeElements(patch, (prevPromise) =>
              prevPromise.then((prev) => {
                const origin = instantResponse
                  ? baseRoute
                  : resolveSettledRoute(prev, initialRoute);
                return combineElements(prev, {
                  ...patch,
                  [ROUTE_ID]: [origin.path, origin.query],
                });
              }),
            );
          });
          setNavigationError({ error });
          throw error;
        }
        const adopted =
          outcome.type === 'loaded' &&
          !!instantResponse &&
          outcome.follows === initialFollows;
        const responsePatch =
          outcome.type === 'reused'
            ? {
                [ROUTE_ID]: [outcome.route.path, outcome.route.query],
                [IS_STATIC_ID]:
                  cache.canReuseStaticRoute(outcome.route, base) ||
                  isStaticFromElements(base),
              }
            : outcome.elements;
        const destination = resolveServerRedirect(
          responsePatch,
          makeStateForAttempt(outcome, historyIntent),
          outcome.route.path,
        );
        const state =
          adopted && isSameRoute(destination.route, initialAttempt.route)
            ? initialState
            : {
                ...makeStateForAttempt(
                  { ...destination, follows: outcome.follows },
                  historyIntent,
                ),
                ...(adopted ? { originalState: initialState } : {}),
              };
        request.target = destination.route;
        request.queuedState = state;
        const patch = combineElements(responsePatch, {
          [ROUTER_STATE_ID]: state,
        });
        const cacheBase = combineElements(
          adopted && instantBase ? combineElements(base, instantBase) : base,
          patch,
        );
        request.base = adopted ? { ...cacheBase } : cacheBase;
        if (adopted) {
          responseFallback = instantBase
            ? combineElements(instantBase, responsePatch)
            : responsePatch;
          return combineElements({}, patch, {
            filter: (key) =>
              key === ROUTER_STATE_ID ||
              (typeof key === 'string' && isMetaKey(key)),
          });
        }
        const responseRoute = getRouteFromElements(patch);
        if (
          responseRoute &&
          !isSameRscRoute(
            responseRoute,
            instantResponse ? initialAttempt.route : settledRoute,
          )
        ) {
          const slotId = getRouteSlotId(responseRoute.path);
          const routePatch = combineElements({}, patch, {
            filter: (key) =>
              typeof key === 'string' && (key === slotId || isMetaKey(key)),
          });
          startTransition(() => {
            void mergeElements(routePatch, mergeWithCachedRoute);
          });
        }
        return patch;
      };
      const patchPromise = loadPatch();
      if (instantResponse) {
        try {
          await instantResponse;
        } catch {
          startTransition(() => {
            void mergeElements(patchPromise, mergeWithCachedRoute);
          });
          await patchPromise;
          return;
        }
        const patch = await patchPromise;
        if (getRouterState(patch)) {
          startTransition(() => {
            void mergeElements(patch, mergeWithCachedRoute);
          });
        }
        return;
      }
      await mergeElements(patchPromise, mergeWithCachedRoute);
    },
    [
      cache,
      initialRoute,
      startInstantPaint,
      mergeElements,
      getElements,
      replaceRequest,
      has404,
      registerRscReloadListener,
    ],
  );

  const getPendingRoute = useCallback(() => requestRef.current?.target, []);
  const commitServerFunctionRoute = useCallback(
    (nextRoute: RouteProps) => {
      const is404 = nextRoute.path === '/404';
      dispatchChangeRoute(changeRoute, nextRoute, {
        refetch: false,
        shouldScroll: false,
        // the 404 route renders where the user already is
        history: is404 ? null : 'push',
        url: is404 ? new URL(window.location.href) : getRouteUrl(nextRoute),
      }).catch((error) => {
        if (!isFollowable(error)) {
          console.error('Error while handling route updates:', error);
        }
      });
    },
    [changeRoute],
  );
  useServerFunctionRouting(serverFunctionRouting, {
    getSettledRoute,
    getPendingRoute,
    onRouteChange: commitServerFunctionRoute,
  });

  useEffect(() => {
    const callback = () => {
      const popped = parseRoute(new URL(window.location.href));
      const nextRoute = routeInterceptor ? routeInterceptor(popped) : popped;
      if (!nextRoute) {
        return;
      }
      startTransition(() => {
        changeRoute(nextRoute, {
          shouldScroll: shouldScrollForRouteChange(
            nextRoute,
            getSettledRoute(),
          ),
          history: null, // the browser already moved the address bar
          // keep the url it moved to; an interceptor rewrite needs a new one
          url: isSameRoute(nextRoute, popped)
            ? new URL(window.location.href)
            : getRouteUrl(nextRoute),
        }).catch((err) => {
          if (!isFollowable(err)) {
            console.error('Error while navigating back:', err);
          }
        });
      });
    };
    window.addEventListener('popstate', callback);
    return () => {
      window.removeEventListener('popstate', callback);
    };
  }, [changeRoute, routeInterceptor, getSettledRoute]);

  return {
    route,
    changeRoute,
    getElements,
    error: navigationError,
  };
};
