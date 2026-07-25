import { unstable_isImmutableElement as isImmutableElement } from '../../minimal/client.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  getRouteFromElements,
  getServerRedirect,
  isMetaKey,
} from './elements-meta.js';
import { getRouteUrl } from './route-url.js';

// the client owned router state; the server's ROUTE_ID owns the path
export const ROUTER_STATE_ID = Symbol('waku-router-state');

// merges carry this object by reference; the consumed flags rely on identity
export type RouterState = {
  url: string; // pathname + search + hash, with the base path
  attempted: readonly [path: string, query: string];
  // null leaves history alone (the browser already wrote it); a push turns into
  // a replace once the reconciler has written
  history: 'push' | 'replace' | null;
  scroll: { pathChanged: boolean } | null; // consumed by the reconciler
  scrollIntent: boolean; // the attempt's decision, for a follow to inherit
};

export const getRouterState = (
  elements: Record<string | symbol, unknown>,
): RouterState | undefined =>
  elements[ROUTER_STATE_ID] as RouterState | undefined;

export const makeRouterState = (
  route: RouteProps,
  url: URL,
  options: {
    history: 'push' | 'replace' | null;
    scroll: boolean;
    pathChanged: boolean;
  },
): RouterState => ({
  url: url.pathname + url.search + url.hash,
  attempted: [route.path, route.query],
  history: options.history,
  scroll: options.scroll ? { pathChanged: options.pathChanged } : null,
  scrollIntent: options.scroll,
});

// a redirect to the 404 route keeps the url that was attempted
export const resolveServerRedirect = (
  elements: Record<string | symbol, unknown>,
  routerState: RouterState,
  fallbackPath: string,
): { route: RouteProps; url: URL } => {
  const stateUrl = new URL(routerState.url, window.location.href);
  const redirect = getServerRedirect(elements, {
    path: routerState.attempted[0],
    query: routerState.attempted[1],
    hash: '',
  });
  if (redirect && redirect.path !== '/404') {
    return { route: redirect, url: getRouteUrl(redirect) };
  }
  return {
    route: {
      path:
        redirect?.path ?? getRouteFromElements(elements)?.path ?? fallbackPath,
      query: stateUrl.searchParams.toString(),
      hash: stateUrl.hash,
    },
    url: stateUrl,
  };
};

export const canCommitInstantly = (
  routeSlotId: string,
  resolvedElements: Record<string, unknown>,
  prefetchedElements: Record<string, unknown> | null | undefined,
) =>
  isImmutableElement(resolvedElements, routeSlotId) ||
  !!(prefetchedElements && isImmutableElement(prefetchedElements, routeSlotId));

// symbol keys are client owned; they are carried, never fetched
export const pinForSwr =
  (getResolvedElements: () => Record<string, unknown>) =>
  (key: string | symbol) =>
    typeof key === 'symbol' ||
    isMetaKey(key) ||
    isImmutableElement(getResolvedElements(), key);
