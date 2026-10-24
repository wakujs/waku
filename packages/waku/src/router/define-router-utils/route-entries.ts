import {
  unstable_buildElements as buildElements,
  unstable_isRenderCancellation as isRenderCancellation,
} from 'waku/minimal/server';
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
import {
  getRequest,
  runWithRouterStore,
  setRscParams,
  setRscPath,
} from './request-store.js';

export type Route = {
  elements: Record<string, ElementSource & { cacheKey?: string }> & {
    root: ElementSource & { cacheKey?: string };
    route: ElementSource & { cacheKey?: string };
  };
  noSsr?: boolean;
};

export type Resolve = (
  pathname: string,
  query: string,
) => Promise<Route | ((req: Request) => Promise<Response>) | null>;

export type ResolveElement = (id: string) => Promise<ElementSource | null>;

export const validateRouteElementIds = (elements: Route['elements']) => {
  for (const id of Object.keys(elements)) {
    if (
      id !== 'root' &&
      id !== 'route' &&
      (id.startsWith('_') || id.startsWith('route:') || /^[A-Z]/.test(id))
    ) {
      throw new Error('Reserved router element ID: ' + id);
    }
  }
};

export const getQuery = (params: unknown): string =>
  params instanceof URLSearchParams
    ? params.get('query') || ''
    : typeof (params as { query?: unknown } | undefined)?.query === 'string'
      ? (params as { query: string }).query
      : '';

export const createRouteEntries = (
  resolve: Resolve,
  resolveElement: ResolveElement | undefined,
  getHas404?: () => Promise<boolean>,
) => {
  let cachedHas404: Promise<boolean> | undefined;
  const has404 = () =>
    (cachedHas404 ??= (
      getHas404
        ? getHas404()
        : runWithRouterStore({ req: getRequest() }, () =>
            resolve('/404', ''),
          ).then((result) => result !== null && typeof result !== 'function')
    ).catch((error) => {
      if (error instanceof Response && error.status === 404) {
        return false;
      }
      cachedHas404 = undefined;
      if (isRenderCancellation(error)) {
        return false;
      }
      throw error;
    }));

  const getRouteMetadata = async (pathname: string, query: string) => ({
    [ROUTE_ID]: [pathname, query] satisfies RouteData,
    ...((await has404()) ? { [HAS404_ID]: true } : {}),
  });

  const getEntriesForRoute = async (
    rscPath: string,
    rscParams: unknown,
    clientEtags: Etags,
    cache: ElementCache,
    {
      route: resolvedRoute,
      populateRouteCache = false,
    }: { route?: Route | undefined; populateRouteCache?: boolean } = {},
  ) => {
    setRscPath(rscPath);
    setRscParams(rscParams);
    const pathname = decodeRoutePath(rscPath);
    const query = getQuery(rscParams);
    const resolved = resolvedRoute ?? (await resolve(pathname, query));
    if (!resolved || typeof resolved === 'function') {
      return null;
    }
    validateRouteElementIds(resolved.elements);
    const { route, ...sources } = resolved.elements;
    const routeId = getRouteSlotId(pathname);
    sources[routeId] = route;
    const etags = { ...clientEtags };
    await Promise.all(
      Object.entries(sources).map(async ([id, source]) => {
        if (source.immutable && etags[id] === 1) {
          const cacheId = getElementCacheId(id, source);
          if (cache.has(cacheId)) {
            await cache.replayIntent(cacheId);
          } else {
            delete etags[id];
          }
        }
      }),
    );
    const entries = await buildElements(
      etags,
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
    entries.elements[IS_STATIC_ID] = Object.entries(sources).every(
      ([id, source]) =>
        source.immutable && cache.has(getElementCacheId(id, source)),
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
};
