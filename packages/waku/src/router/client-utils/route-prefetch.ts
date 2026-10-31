import { preloadModule } from 'react-dom';
import type {
  PrefetchOptions,
  RouterCache,
} from '../client-core-utils/caches.js';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

export function preloadRouteModules(path: string) {
  globalThis.__WAKU_ROUTER_PREFETCH__?.(path, (id) => {
    preloadModule(id, { as: 'script' });
  });
}

export function prefetchRouteUnlessReusable(
  cache: RouterCache,
  route: RouteProps,
  options: PrefetchOptions | undefined,
  getElements: (() => Record<string, unknown>) | undefined,
) {
  const elements = getElements?.();
  if (elements && cache.canReuseStaticRoute(route, elements)) {
    return;
  }
  cache.prefetchRoute(route, options);
}
