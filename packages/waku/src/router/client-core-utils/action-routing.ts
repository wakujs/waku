import { useLayoutEffect } from 'react';
import { unstable_combineElements as combineElements } from 'waku/minimal/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  getRouteFromElements,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import { useRouterCache } from './caches.js';
import { isSameRscRoute } from './route-url.js';

type ActionRoutingCallbacks = {
  getSettledRoute: () => RouteProps;
  getPendingRoute: () => Pick<RouteProps, 'path' | 'query'> | undefined;
  onRouteChange: (route: RouteProps) => void;
};

/** Holds one Root's action policy and its committed navigation callbacks. */
export type ActionRouting = {
  enhancer: Unstable_RscEnhancer;
  /** Cleanup disconnects only this connection. Prefer `useActionRouting_UNSTABLE`. */
  connect: (
    connection: ActionRoutingCallbacks & {
      cache: ReturnType<typeof useRouterCache>;
    },
  ) => () => void;
};

/**
 * Creates action routing for one custom router. Install `enhancer` last in
 * that router's Root `rscEnhancers`, then connect navigation callbacks with
 * `useActionRouting_UNSTABLE` beneath the Root. Create the controller and Root's
 * stable enhancer array before rendering React. RSC requests pass through.
 * Actions before connection fail; start mount-time actions in `useEffect`,
 * not descendant layout effects.
 */
export const createActionRouting = (): ActionRouting => {
  let connection: Parameters<ActionRouting['connect']>[0] | undefined;
  let connected = false;
  return {
    connect: (nextConnection) => {
      connection = nextConnection;
      connected = true;
      return () => {
        if (connection === nextConnection) {
          connected = false;
        }
      };
    },
    enhancer: (next) => async (rscPath, rscParams, options) => {
      if (options.type !== 'call') {
        return next(rscPath, rscParams, options);
      }
      if (!connected || !connection) {
        throw new Error(
          'Action routing is not connected. Call mount-time actions from useEffect, not useLayoutEffect.',
        );
      }
      const origin = connection.getSettledRoute();
      const result = await next(rscPath, rscParams, {
        ...options,
        fetch: (input, init) => {
          const headers = new Headers(
            init?.headers ??
              (input instanceof Request ? input.headers : undefined),
          );
          headers.set(
            ACTION_LOCATION_HEADER,
            origin.query ? origin.path + '?' + origin.query : origin.path,
          );
          return options.fetch(input, { ...init, headers });
        },
      });
      const { cache, getSettledRoute, getPendingRoute, onRouteChange } =
        connection;
      const handleActionElements = (nextElements: Record<string, unknown>) => {
        cache.learnStaticFromElements(nextElements);
        const route = getRouteFromElements(nextElements);
        if (!route) {
          return;
        }
        const settledRoute = getSettledRoute();
        if (
          settledRoute.path === route.path &&
          (isStaticFromElements(nextElements) ||
            settledRoute.query === route.query)
        ) {
          return;
        }
        onRouteChange(route);
      };
      if (!(IS_ORIGIN_ID in result.elements)) {
        if (Reflect.ownKeys(result.elements).length) {
          handleActionElements(result.elements);
        }
        return result;
      }
      const pendingRoute = getPendingRoute();
      // React holds a navigation back until a pending action settles
      if (
        (pendingRoute && !isSameRscRoute(pendingRoute, origin)) ||
        !isSameRscRoute(getSettledRoute(), origin)
      ) {
        return { ...result, elements: {} };
      }
      const elements = combineElements({}, result.elements, {
        filter: (key) => key !== IS_ORIGIN_ID,
      });
      handleActionElements(elements);
      return { ...result, elements };
    },
  };
};

/**
 * Connects a declaratively installed action-routing controller to this Root.
 * Each action reports `getSettledRoute()` as its origin. Origin rerenders are
 * dropped, retaining the action value, if the settled or pending route changes.
 * `getPendingRoute` returns the uncommitted destination or `undefined`.
 * `onRouteChange` commits a different response route without fetching: Minimal
 * merges its elements after the enhancer chain resolves. Callback updates take
 * effect on commit without replacing the enhancer.
 */
export const useActionRouting = (
  actionRouting: ActionRouting,
  { getSettledRoute, getPendingRoute, onRouteChange }: ActionRoutingCallbacks,
): void => {
  const cache = useRouterCache();
  useLayoutEffect(
    () =>
      actionRouting.connect({
        cache,
        getSettledRoute,
        getPendingRoute,
        onRouteChange,
      }),
    [actionRouting, cache, getSettledRoute, getPendingRoute, onRouteChange],
  );
};
