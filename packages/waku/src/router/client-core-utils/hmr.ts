import { startTransition, useEffect } from 'react';
import {
  useMergeElements_UNSTABLE as useMergeElements,
  useRegisterRscReloadListener_UNSTABLE as useRegisterRscReloadListener,
} from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { encodeRoutePath } from '../isomorphic-utils/router-protocol.js';
import { createRscParams, useRouterCache } from './caches.js';

/**
 * Refetches the supplied route and registered lazy slices on development reloads.
 * Reads the route before `onBeforeRefetch` runs and invalidates Router caches.
 */
export const useHmrRefetch = ({
  getSettledRoute,
  onBeforeRefetch,
}: {
  getSettledRoute: () => RouteProps;
  onBeforeRefetch?: () => void;
}): void => {
  const mergeElements = useMergeElements();
  const registerRscReloadListener = useRegisterRscReloadListener();
  const cache = useRouterCache();
  useEffect(() => {
    if (import.meta.hot) {
      const refetchRouteOnHmr = () => {
        const settledRoute = getSettledRoute();
        onBeforeRefetch?.();
        cache.clearCaches();
        startTransition(() => {
          void mergeElements(
            cache.fetchRsc(
              encodeRoutePath(settledRoute.path),
              createRscParams(settledRoute.query),
            ),
          ).then(cache.learnStaticFromElements, () => {});
          cache.slices.forEachRegisteredLazySlice((id) => {
            cache.slices.fetchSlice(id, mergeElements, true);
          });
        });
      };
      return registerRscReloadListener(refetchRouteOnHmr);
    }
  }, [
    cache,
    getSettledRoute,
    mergeElements,
    onBeforeRefetch,
    registerRscReloadListener,
  ]);
};
