import {
  unstable_isImmutableElement as isImmutableElement,
  useFetchRsc_UNSTABLE as useFetchRsc,
} from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  encodeRoutePath,
  getRouteFromElements,
  getRouteSlotId,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import { load } from './load.js';
import type { LoadOptions, LoadOutcome } from './load.js';
import {
  type PrefetchEntry,
  type PrefetchOptions,
  createPrefetchManager,
} from './prefetch-cache.js';
import { createSliceCache } from './slice-cache.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

type CachedLoadOptions = LoadOptions & {
  /** `false` reuses the initial attempt without fetching. */
  refetch?: boolean;
  /** Supplies the first attempt's response; follows use normal fetching. */
  adopt?: Promise<Elements>;
  /** Current Root elements used for etags and static-route reuse. */
  base: Elements;
  /** Overrides Minimal's default build-mismatch reload when supplied. */
  onBuildIdMismatch?: (url: URL) => void;
  /** Observes prefetch invalidation with the affected attempt's browser URL. */
  onInvalidate?: (url: URL) => void;
};

export type FetchRsc = ReturnType<typeof useFetchRsc>;

export type { PrefetchOptions } from './prefetch-cache.js';

export type PrefetchHandle = Pick<PrefetchEntry, 'promise' | 'onInvalidate'>;

export const createRscParams = (query: string): URLSearchParams =>
  new URLSearchParams({ query });

const createRouterCache = (fetchRsc: FetchRsc) => {
  const manager = createPrefetchManager();
  const staticPathSet = new Set<string>();

  const getPrefetchedElements = (route: RouteProps): Elements | undefined =>
    manager.getElements(encodeRoutePath(route.path));

  const canReuseStaticRoute = (route: RouteProps, elements: Elements) =>
    staticPathSet.has(route.path) && getRouteSlotId(route.path) in elements;

  return {
    fetchRsc,
    slices: createSliceCache(fetchRsc),
    prefetchRoute: (route: RouteProps, options?: PrefetchOptions): void => {
      // the caller skips this with canReuseStaticRoute, which needs its elements
      const rscPath = encodeRoutePath(route.path);
      manager.prefetch(
        rscPath,
        route.query,
        (base, invalidate) =>
          fetchRsc(rscPath, createRscParams(route.query), {
            ...(base ? { unstable_base: base } : {}),
            onBuildIdMismatch: () => {
              invalidate();
              manager.clear();
            },
          }),
        options,
      );
    },
    hasCachedShell: (
      route: RouteProps,
      currentElements: Record<string, unknown>,
    ): boolean => {
      const slotId = getRouteSlotId(route.path);
      const prefetched = getPrefetchedElements(route);
      return (
        isImmutableElement(currentElements, slotId) ||
        !!(prefetched && isImmutableElement(prefetched, slotId))
      );
    },
    getPrefetchedElements,
    getPrefetch: (route: RouteProps): PrefetchHandle | undefined =>
      manager.get(encodeRoutePath(route.path), route.query),
    canReuseStaticRoute,
    /**
     * Loads with static reuse, an optional initial response, prefetch, or the
     * network, in that order. Preserves `unstable_load`'s follow and cancellation
     * behavior, and releases prefetch subscriptions as their attempts finish.
     * Does not merge elements or commit browser state. Cached synchronous
     * commits belong to the binding, before awaiting this method.
     */
    load: async (
      requested: RouteProps,
      opts: CachedLoadOptions,
    ): Promise<LoadOutcome> => {
      const initialFollows = opts.follows ?? 0;
      let unsubscribe: (() => void) | undefined;
      try {
        return await load(
          async (attempt, signal) => {
            const unsubscribePrevious = unsubscribe;
            unsubscribe = undefined;
            try {
              const first = attempt.follows === initialFollows;
              if (
                canReuseStaticRoute(attempt.route, opts.base) ||
                (first && opts.refetch === false)
              ) {
                return;
              }
              const cached = manager.get(
                encodeRoutePath(attempt.route.path),
                attempt.route.query,
              );
              unsubscribe = cached?.onInvalidate(() => {
                if (!signal.aborted) {
                  opts.onInvalidate?.(attempt.url);
                }
              });
              if (first && opts.adopt !== undefined) {
                return opts.adopt;
              }
              if (cached) {
                return cached.promise;
              }
              const onBuildIdMismatch = opts.onBuildIdMismatch;
              return fetchRsc(
                encodeRoutePath(attempt.route.path),
                createRscParams(attempt.route.query),
                {
                  signal,
                  ...(onBuildIdMismatch
                    ? {
                        onBuildIdMismatch: () => onBuildIdMismatch(attempt.url),
                      }
                    : {}),
                  unstable_base: opts.base,
                },
              );
            } finally {
              unsubscribePrevious?.();
            }
          },
          requested,
          opts,
        );
      } finally {
        unsubscribe?.();
      }
    },
    learnStaticFromElements: (elements: Record<string, unknown>): void => {
      const route = getRouteFromElements(elements);
      if (route && isStaticFromElements(elements)) {
        staticPathSet.add(route.path);
      }
    },
    clearCaches: (): void => {
      manager.clear();
      staticPathSet.clear();
    },
  };
};

export type RouterCache = ReturnType<typeof createRouterCache>;

const routerCaches = new WeakMap<FetchRsc, RouterCache>();

export const getRouterCache = (fetchRsc: FetchRsc): RouterCache => {
  let cache = routerCaches.get(fetchRsc);
  if (!cache) {
    cache = createRouterCache(fetchRsc);
    routerCaches.set(fetchRsc, cache);
  }
  return cache;
};

/**
 * Returns the Router cache of the enclosing Root. Outside a Root every caller
 * shares one cache, as they share one fetch.
 */
export const useRouterCache = (): RouterCache => getRouterCache(useFetchRsc());
