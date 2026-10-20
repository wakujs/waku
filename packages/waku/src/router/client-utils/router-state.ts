import { useInsertionEffect } from 'react';
import {
  unstable_combineElements as combineElements,
  unstable_formatRscUrl as formatRscUrl,
  useRegisterRscEnhancer_UNSTABLE as useRegisterRscEnhancer,
} from 'waku/minimal/client';
import { getRouteUrl, isSameRscRoute } from '../client-core-utils/route-url.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  ROUTE_ID,
  encodeRoutePath,
  getRouteFromElements,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteData } from '../isomorphic-utils/router-protocol.js';

const REDIRECT_ENHANCER_ORDER = 80;

export const ROUTER_STATE_ID = Symbol('waku-router-state');

export const useServerRedirect = () => {
  const registerRscEnhancer = useRegisterRscEnhancer();
  useInsertionEffect(
    () =>
      registerRscEnhancer(
        (next) => async (rscPath, rscParams, options) => {
          if (options.type !== 'rsc') {
            return next(rscPath, rscParams, options);
          }
          let redirectedUrl: URL | undefined;
          const result = await next(rscPath, rscParams, {
            ...options,
            fetch: async (input, init) => {
              const response = await options.fetch(input, init);
              redirectedUrl = response.redirected
                ? new URL(response.url)
                : undefined;
              return response;
            },
          });
          const route = getRouteFromElements(result.elements);
          if (
            !redirectedUrl ||
            !route ||
            !isStaticFromElements(result.elements)
          ) {
            return result;
          }
          if (
            redirectedUrl.pathname !==
            formatRscUrl(encodeRoutePath(route.path), redirectedUrl).pathname
          ) {
            return result;
          }
          return {
            ...result,
            elements: combineElements(result.elements, {
              [ROUTE_ID]: [
                route.path,
                redirectedUrl.searchParams.get('query') ?? '',
              ] satisfies RouteData,
            }),
          };
        },
        REDIRECT_ENHANCER_ORDER,
      ),
    [registerRscEnhancer],
  );
};

export type RouterState = {
  readonly url: string; // pathname + search + hash, with the base path
  readonly requested: readonly [path: string, query: string];
  readonly history: 'push' | 'replace' | null;
  readonly scroll: { readonly pathChanged: boolean } | null;
  readonly follows: number;
  readonly failedFrom?: RouteProps;
  readonly originalState?: RouterState;
};

type InstantRouterState = {
  readonly state: RouterState;
  readonly slotIds: ReadonlySet<string>;
};

export const makeInstantRouterState = (
  state: RouterState,
  elements: Record<string | symbol, unknown>,
): InstantRouterState => ({ state, slotIds: new Set(Object.keys(elements)) });

export const getRouterState = (
  elements: Record<string | symbol, unknown>,
): RouterState | undefined => {
  const state = elements[ROUTER_STATE_ID] as
    RouterState | InstantRouterState | undefined;
  return state && 'state' in state ? state.state : state;
};

export const getInstantSlotIds = (
  elements: Record<string | symbol, unknown>,
): ReadonlySet<string> | undefined => {
  const state = elements[ROUTER_STATE_ID] as
    RouterState | InstantRouterState | undefined;
  return state && 'state' in state ? state.slotIds : undefined;
};

export const makeRouterState = (
  route: RouteProps,
  url: URL,
  options: {
    history: 'push' | 'replace' | null;
    scroll: boolean;
    pathChanged: boolean;
    follows: number;
  },
): RouterState => ({
  url: url.pathname + url.search + url.hash,
  requested: [route.path, route.query],
  history: options.history,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
  follows: options.follows,
});

export const resolveServerRedirect = (
  elements: Record<string | symbol, unknown>,
  routerState: RouterState,
  fallbackPath: string,
): { route: RouteProps; url: URL } => {
  const stateUrl = new URL(routerState.url, window.location.href);
  if (routerState.failedFrom) {
    return {
      route: {
        path: routerState.requested[0],
        query: stateUrl.searchParams.toString(),
        hash: stateUrl.hash,
      },
      url: stateUrl,
    };
  }
  const serverRoute = getRouteFromElements(elements);
  const redirect =
    serverRoute &&
    (serverRoute.path !== routerState.requested[0] ||
      (!isStaticFromElements(elements) &&
        serverRoute.query !== routerState.requested[1]))
      ? serverRoute
      : undefined;
  if (redirect && redirect.path !== '/404') {
    return { route: redirect, url: getRouteUrl(redirect) };
  }
  return {
    route: {
      path: redirect?.path ?? serverRoute?.path ?? fallbackPath,
      query: stateUrl.searchParams.toString(),
      hash: stateUrl.hash,
    },
    url: stateUrl,
  };
};

export const getSettledRoute = (
  elements: Record<string | symbol, unknown>,
  fallback: RouteProps,
): RouteProps => {
  const routerState = getRouterState(elements);
  if (!routerState) {
    return fallback;
  }
  if (routerState.failedFrom) {
    const retained = getRouteFromElements(elements);
    return retained && !isSameRscRoute(retained, routerState.failedFrom)
      ? retained
      : routerState.failedFrom;
  }
  return resolveServerRedirect(elements, routerState, fallback.path).route;
};
