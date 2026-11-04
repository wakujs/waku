import { unstable_buildElements as buildElements } from 'waku/minimal/server';
import type {
  Unstable_ElementSource as ElementSource,
  Unstable_Etags as Etags,
} from 'waku/minimal/server';
import {
  HAS404_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  decodeRoutePath,
  getRouteSlotId,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteData } from '../isomorphic-utils/router-protocol.js';
import { cacheElementSource, getElementCacheId } from './element-cache.js';
import type { ElementCache } from './element-cache.js';
import { setRscParams, setRscPath } from './request-store.js';

export type RouterDefinition = {
  elements: Record<string, ElementSource & { cacheKey?: string }> & {
    root: ElementSource & { cacheKey?: string };
    route: ElementSource & { cacheKey?: string };
  };
  noSsr?: boolean;
};

export type Resolve = (
  pathname: string,
  query: string,
) => Promise<RouterDefinition | ((req: Request) => Promise<Response>) | null>;

export type ResolveElement = (id: string) => Promise<ElementSource | null>;

export function validateRouteElementIds(
  elements: RouterDefinition['elements'],
) {
  for (const id of Object.keys(elements)) {
    if (
      id !== 'root' &&
      id !== 'route' &&
      (id.startsWith('_') || id.startsWith('route:') || /^[A-Z]/.test(id))
    ) {
      throw new Error('Reserved router element ID: ' + id);
    }
  }
}

export function getQuery(params: unknown): string {
  return params instanceof URLSearchParams
    ? params.get('query') || ''
    : typeof (params as { query?: unknown } | undefined)?.query === 'string'
      ? (params as { query: string }).query
      : '';
}

export function createRouteEntries(
  resolve: Resolve,
  resolveElement: ResolveElement | undefined,
  getHas404?: () => Promise<boolean>,
) {
  const has404 = getHas404 ?? (async () => false);

  const getRouteMetadata = async (pathname: string, query: string) => ({
    [ROUTE_ID]: [pathname, query] satisfies RouteData,
    ...((await has404()) ? { [HAS404_ID]: true } : {}),
  });

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    clientEtags: Etags,
    cache: ElementCache,
    routerDefinition?: RouterDefinition,
    populateRouteCache = false,
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const pathname = decodeRoutePath(rscPath);
    const query = getQuery(rscParams);
    const resolved = routerDefinition ?? (await resolve(pathname, query));
    if (!resolved || typeof resolved === 'function') {
      return null;
    }
    validateRouteElementIds(resolved.elements);
    const { route, ...sources } = resolved.elements;
    const routeId = getRouteSlotId(pathname);
    sources[routeId] = route;
    const entries = await buildElements(
      clientEtags,
      Object.fromEntries(
        Object.entries(sources).map(([id, source]) => [
          id,
          cacheElementSource(
            source,
            getElementCacheId(id, source),
            cache,
            id !== routeId ||
              source.cacheKey !== undefined ||
              populateRouteCache,
          ),
        ]),
      ),
    );
    Object.assign(entries.elements, await getRouteMetadata(pathname, query));
    entries.elements[IS_STATIC_ID] = Object.values(sources).every(
      (source) => source.immutable,
    );
    return entries;
  };

  const getEntriesForElement = async (
    id: string,
    cache: ElementCache,
    resolvedSource?: ElementSource,
  ) => {
    const source = resolvedSource ?? (await resolveElement?.(id));
    return source
      ? buildElements(
          {},
          {
            [id]: cacheElementSource(
              source,
              getElementCacheId(id, source),
              cache,
            ),
          },
        )
      : null;
  };

  return { getEntriesForRoute, getEntriesForElement, getRouteMetadata, has404 };
}
