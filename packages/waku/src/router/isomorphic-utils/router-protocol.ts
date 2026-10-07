import type { RouteProps } from './route-path.js';

/** Element-map key for `[pathname, query]` of the represented route. */
export const ROUTE_ID = 'ROUTE';

/** Whether every source of the resolved route is immutable, including omitted slots. */
export const IS_STATIC_ID = 'IS_STATIC';

/** Whether the server provides a custom `/404` route. */
export const HAS404_ID = 'HAS404';

export const IS_ORIGIN_ID = 'IS_ORIGIN';

export const ACTION_LOCATION_HEADER = 'X-Waku-Action-Location';

export type RouteData = readonly [path: string, query: string];

/**
 * Returns the represented pathname and query with an empty hash, or `undefined`
 * without metadata. The route can differ from the request; cached and instant
 * paints also carry it, so this does not imply a fetch has settled.
 */
export const getRouteFromElements = (
  elements: Record<string, unknown>,
): RouteProps | undefined => {
  const routeData = elements[ROUTE_ID] as RouteData | undefined;
  return routeData
    ? { path: routeData[0], query: routeData[1], hash: '' }
    : undefined;
};

/**
 * Returns whether every source of the represented route is immutable, including
 * slots omitted by etags. Returns false without metadata; unrelated to prerendering.
 */
export const isStaticFromElements = (
  elements: Record<string, unknown>,
): boolean => !!elements[IS_STATIC_ID];

/** Returns whether a custom `/404` route is available; false without metadata. */
export const has404FromElements = (
  elements: Record<string, unknown>,
): boolean => !!elements[HAS404_ID];

export const isMetaKey = (key: string) =>
  key === ROUTE_ID || key === HAS404_ID || key === IS_STATIC_ID;

const ROUTE_SLOT_ID_PREFIX = 'route:';
const SLICE_SLOT_ID_PREFIX = 'slice:';

/** Returns `route:<path>` for a normalized pathname without query or hash. */
export const getRouteSlotId = (path: string): string =>
  ROUTE_SLOT_ID_PREFIX + path;

/** Returns `slice:<id>` for both bundled and independently fetched slices. */
export const getSliceSlotId = (id: string): string => SLICE_SLOT_ID_PREFIX + id;

export const isRouteSlotId = (slotId: string): boolean =>
  slotId.startsWith(ROUTE_SLOT_ID_PREFIX);

export const isSliceSlotId = (slotId: string): boolean =>
  slotId.startsWith(SLICE_SLOT_ID_PREFIX);

const ROUTE_PREFIX = 'R';
const SLICE_PREFIX = 'S/';

/**
 * Encodes a normalized pathname for an RSC request; query and hash are separate.
 * Throws for paths without a leading `/`, with a trailing `/`, or ending in
 * `/index.html`, except that `/` itself is allowed.
 */
export function encodeRoutePath(routePath: string): string {
  if (!routePath.startsWith('/')) {
    throw new Error('Route path must start with `/`: ' + routePath);
  }
  if (routePath.length > 1 && routePath.endsWith('/')) {
    throw new Error('Route path must not end with `/`: ' + routePath);
  }
  if (routePath.endsWith('/index.html')) {
    throw new Error('Route path must not end with `/index.html`: ' + routePath);
  }
  if (routePath === '/') {
    return ROUTE_PREFIX + '/_root';
  }
  if (routePath.startsWith('/_')) {
    return ROUTE_PREFIX + '/__' + routePath.slice(2);
  }
  return ROUTE_PREFIX + routePath;
}

/** Decodes a route RSC input; throws if it does not have the route prefix. */
export function decodeRoutePath(rscPath: string): string {
  if (!rscPath.startsWith(ROUTE_PREFIX)) {
    throw new Error('rscPath should start with: ' + ROUTE_PREFIX);
  }
  if (rscPath === ROUTE_PREFIX + '/_root') {
    return '/';
  }
  if (rscPath.startsWith(ROUTE_PREFIX + '/__')) {
    return '/_' + rscPath.slice(ROUTE_PREFIX.length + 3);
  }
  return rscPath.slice(ROUTE_PREFIX.length);
}

/** Encodes one independently requested slice; throws if the ID starts with `/`. */
export function encodeSliceId(sliceId: string): string {
  if (sliceId.startsWith('/')) {
    throw new Error('Slice id must not start with `/`: ' + sliceId);
  }
  return SLICE_PREFIX + sliceId;
}

/** Returns the slice ID of an RSC input, or `null` for another request kind. */
export function decodeSliceId(rscPath: string): string | null {
  if (!rscPath.startsWith(SLICE_PREFIX)) {
    return null;
  }
  return rscPath.slice(SLICE_PREFIX.length);
}
