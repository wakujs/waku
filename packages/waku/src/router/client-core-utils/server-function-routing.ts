import { useLayoutEffect } from 'react';
import { unstable_combineElements as combineElements } from 'waku/minimal/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  getRouteFromElements,
} from '../isomorphic-utils/router-protocol.js';
import { useRouterCache } from './caches.js';
import { isSameRscRoute } from './route-url.js';

type ServerFunctionRoutingCallbacks = {
  getSettledRoute: () => RouteProps;
  getPendingRoute: () => Pick<RouteProps, 'path' | 'query'> | undefined;
  applyRouteResponse: (
    elements: Readonly<Record<string | symbol, unknown>>,
  ) => void | Promise<void>;
};

/**
 * Holds one Root's server function routing policy and its committed
 * navigation callbacks.
 */
export type ServerFunctionRouting = {
  enhancer: Unstable_RscEnhancer;
  /**
   * Cleanup disconnects only this connection. Prefer
   * `useServerFunctionRouting_UNSTABLE`.
   */
  connect: (
    connection: ServerFunctionRoutingCallbacks & {
      cache: ReturnType<typeof useRouterCache>;
    },
  ) => () => void;
};

/**
 * Creates server function routing for one custom router. Install `enhancer`
 * last in that router's Root `rscEnhancers`, then connect navigation
 * callbacks with `useServerFunctionRouting_UNSTABLE` beneath the Root. Create
 * the controller and Root's stable enhancer array before rendering React. RSC
 * requests pass through. Server function calls before connection fail; start
 * mount-time calls in `useEffect`, not descendant layout effects.
 */
export function createServerFunctionRouting(): ServerFunctionRouting {
  let connection: Parameters<ServerFunctionRouting['connect']>[0] | undefined;
  return {
    connect: (nextConnection) => {
      connection = nextConnection;
      return () => {
        if (connection === nextConnection) {
          connection = undefined;
        }
      };
    },
    enhancer: (next) => async (rscPath, rscParams, options) => {
      if (options.type !== 'call') {
        return next(rscPath, rscParams, options);
      }
      if (!connection) {
        throw new Error(
          'Server function routing is not connected. Call mount-time server functions from useEffect, not useLayoutEffect.',
        );
      }
      const origin = connection.getSettledRoute();
      const applyIntent = connection.cache.captureRouteIntentScope(
        options.signal,
      );
      const response = await next(rscPath, rscParams, {
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
      if (!connection) {
        return { ...response, elements: {} };
      }
      const { getSettledRoute, getPendingRoute, applyRouteResponse } =
        connection;
      let responseElements = response.elements;
      if (IS_ORIGIN_ID in responseElements) {
        const pendingRoute = getPendingRoute();
        // React holds a navigation back until a pending action settles
        if (pendingRoute || !isSameRscRoute(getSettledRoute(), origin)) {
          return { ...response, elements: {} };
        }
        responseElements = combineElements({}, responseElements, {
          filter: (key) => key !== IS_ORIGIN_ID,
        });
      }
      if (getRouteFromElements(responseElements)) {
        await applyRouteResponse(responseElements);
        return { ...response, elements: {} };
      }
      const elements = applyIntent?.(responseElements) ?? responseElements;
      return elements === response.elements
        ? response
        : { ...response, elements };
    },
  };
}

/**
 * Connects a declaratively installed server-function-routing controller to this Root.
 * Each server function call reports `getSettledRoute()` as its origin. Origin
 * rerenders are dropped, retaining the return value, if the settled route changes
 * or any navigation request is pending.
 * `getPendingRoute` returns the uncommitted destination or `undefined`.
 * `applyRouteResponse` handles every accepted route-bearing response, including
 * same-route updates. It owns applying the elements and their intents; Minimal
 * does not merge that response again. The controller waits for the callback.
 * A rejected callback rejects the call. Callback updates take effect on commit
 * without replacing the enhancer. A response arriving without a connected
 * binding retains its return value and discards its elements.
 */
export function useServerFunctionRouting(
  serverFunctionRouting: ServerFunctionRouting,
  {
    getSettledRoute,
    getPendingRoute,
    applyRouteResponse,
  }: ServerFunctionRoutingCallbacks,
): void {
  const cache = useRouterCache();
  useLayoutEffect(
    () =>
      serverFunctionRouting.connect({
        cache,
        getSettledRoute,
        getPendingRoute,
        applyRouteResponse,
      }),
    [
      serverFunctionRouting,
      cache,
      getSettledRoute,
      getPendingRoute,
      applyRouteResponse,
    ],
  );
}
