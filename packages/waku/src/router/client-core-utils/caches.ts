import {
  unstable_isImmutableElement as isImmutableElement,
  useFetchRsc_UNSTABLE as useFetchRsc,
} from 'waku/minimal/client';
import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  INTENT_ID,
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

type RouteIntentObserver = (
  type: 'rsc' | 'call',
  signal: AbortSignal | undefined,
) => (elements: Elements) => Elements | Promise<Elements>;

type CachedLoadOptions = LoadOptions & {
  /** `false` reuses the initial attempt without fetching. */
  refetch?: boolean;
  /** Supplies the first attempt's response; follows use normal fetching. */
  adopt?: Promise<Elements>;
  /** Retained elements used for etags and static-route reuse. */
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
  let intentObserver: RouteIntentObserver | undefined;
  const captureRouteIntentScope = (
    type: 'rsc' | 'call',
    signal?: AbortSignal,
  ) => intentObserver?.(type, signal);
  const fetchRouteElements: FetchRsc = async (...args) => {
    const [, , options] = args;
    const applyIntent = captureRouteIntentScope('rsc', options?.signal);
    const elements = await fetchRsc(...args);
    return applyIntent?.(elements) ?? elements;
  };
  const manager = createPrefetchManager();
  const intentPromisesByRoutePath = new Map<
    string,
    Promise<string | undefined> | undefined
  >();

  const getPrefetchedElements = (route: RouteProps): Elements | undefined =>
    manager.getElements(encodeRoutePath(route.path));

  const canReuseStaticRoute = (route: RouteProps, elements: Elements) =>
    intentPromisesByRoutePath.has(route.path) &&
    getRouteSlotId(route.path) in elements;

  const learnStaticFromElements = (elements: Elements): void => {
    const route = getRouteFromElements(elements);
    if (route && isStaticFromElements(elements)) {
      intentPromisesByRoutePath.set(
        route.path,
        elements[INTENT_ID] as Promise<string | undefined> | undefined,
      );
    }
  };

  return {
    fetchRsc: fetchRouteElements,
    slices: createSliceCache(fetchRouteElements),
    captureRouteIntentScope,
    connectRouteIntentObserver(observer: RouteIntentObserver) {
      intentObserver = observer;
      return () => {
        if (intentObserver === observer) {
          intentObserver = undefined;
        }
      };
    },
    prefetchRoute: (route: RouteProps, options?: PrefetchOptions): void => {
      const rscPath = encodeRoutePath(route.path);
      manager.prefetch(
        rscPath,
        route.query,
        (base, invalidate) =>
          fetchRouteElements(rscPath, createRscParams(route.query), {
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
    getStaticRouteIntent: (route: RouteProps) =>
      intentPromisesByRoutePath.get(route.path),
    /**
     * Loads an optional initial response before static reuse, prefetch, or the
     * network, using `unstable_load`'s follow and cancellation rules.
     * Network results are response patches; cached prefetches return stored
     * maps. Combine patches with the retained base when reading a full snapshot.
     * Cached synchronous commits belong to the binding.
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
                !(first && opts.adopt !== undefined) &&
                (canReuseStaticRoute(attempt.route, opts.base) ||
                  (first && opts.refetch === false))
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
              const onBuildIdMismatch = opts.onBuildIdMismatch;
              const pending =
                first && opts.adopt !== undefined
                  ? opts.adopt
                  : cached?.promise;
              return await (pending ??
                fetchRouteElements(
                  encodeRoutePath(attempt.route.path),
                  createRscParams(attempt.route.query),
                  {
                    signal,
                    ...(onBuildIdMismatch
                      ? {
                          onBuildIdMismatch: () =>
                            onBuildIdMismatch(attempt.url),
                        }
                      : {}),
                    unstable_base: opts.base,
                  },
                ));
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
    learnStaticFromElements,
    clearCaches: (): void => {
      manager.clear();
      intentPromisesByRoutePath.clear();
    },
  };
};

export type RouterCache = ReturnType<typeof createRouterCache>;

const routerCaches = new WeakMap<FetchRsc, RouterCache>();

const getRouterCache = (fetchRsc: FetchRsc): RouterCache => {
  let cache = routerCaches.get(fetchRsc);
  if (!cache) {
    cache = createRouterCache(fetchRsc);
    routerCaches.set(fetchRsc, cache);
  }
  return cache;
};
export const getRouterCacheForTest = getRouterCache;

/**
 * Returns the Router cache of the enclosing Root. Outside a Root every caller
 * shares one cache, as they share one fetch.
 */
export const useRouterCache = (): RouterCache => getRouterCache(useFetchRsc());
