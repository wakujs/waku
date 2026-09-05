import { addBase, removeBase } from '../../lib/utils/path.js';
import {
  decodeFuncId,
  decodeRscPath,
  encodeRscPath,
} from '../../lib/utils/rsc-path.js';
import {
  decodeRoutePath,
  decodeSliceId,
  encodeRoutePath,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';

const getBasePath = () => import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/';
const getRscBase = () => import.meta.env?.WAKU_CONFIG_RSC_BASE ?? 'RSC';

/**
 * What the router makes of an incoming request.
 *
 * A route is reported the same way whether the browser asked for the document
 * or the client router asked for its RSC payload, so a check written against
 * `path` covers both. An action carries no route: it is dispatched by function
 * id, so no path-based rule can scope it.
 */
export type Unstable_RouterRequest =
  /** A page request: the document, or the RSC payload for the same route. */
  | { type: 'route'; path: string; query: string }
  /** A slice payload request. */
  | { type: 'slice'; id: string }
  /** A server action call. Carries no route — see the type docs. */
  | { type: 'action' };

/**
 * Reads a request the way `waku/router` will read it, so middleware can match
 * on a route path instead of on Waku's internal RSC url shape.
 *
 * Returns `null` when the request is not addressed to this app (outside
 * `basePath`) or when an RSC url does not decode.
 *
 * This reports how the url is *read*, not whether a route exists: a request for
 * `/favicon.ico` parses as a route with that path. Deciding which paths matter
 * is the caller's job.
 *
 * A route-matched check here is an optimistic redirect, not an authorization
 * boundary — it cannot cover `type: 'action'`, and it runs before the router
 * has resolved anything. Enforce authorization where the data is read.
 */
export function parseRouterRequest(
  req: Request,
): Unstable_RouterRequest | null {
  const basePath = getBasePath();
  const rscBase = getRscBase();
  const url = new URL(req.url);
  let pathname: string;
  try {
    pathname = removeBase(url.pathname, basePath);
  } catch {
    return null;
  }
  const query = url.searchParams.toString();
  const rscPathPrefix = '/' + rscBase + '/';
  if (!pathname.startsWith(rscPathPrefix)) {
    return { type: 'route', path: pathnameToRoutePath(pathname), query };
  }
  let rscPath: string;
  try {
    rscPath = decodeRscPath(pathname.slice(rscPathPrefix.length));
  } catch {
    return null;
  }
  if (decodeFuncId(rscPath) !== null) {
    return { type: 'action' };
  }
  const sliceId = decodeSliceId(rscPath);
  if (sliceId !== null) {
    return { type: 'slice', id: sliceId };
  }
  try {
    return { type: 'route', path: decodeRoutePath(rscPath), query };
  } catch {
    return null;
  }
}

/**
 * The inverse of `parseRouterRequest` for routes: the url that addresses
 * `routePath` the same way `req` addressed its own route. A request for the
 * document gets the document url back; a request for an RSC payload gets the
 * payload url, so a rewrite keeps the kind of response the caller expects.
 *
 * Returns `null` when `req` is not a route request, since an action or a slice
 * has no route to rewrite.
 */
export function formatRouterRequest(
  req: Request,
  routePath: string,
  query?: string,
): URL | null {
  const parsed = parseRouterRequest(req);
  if (parsed?.type !== 'route') {
    return null;
  }
  const basePath = getBasePath();
  const rscBase = getRscBase();
  const url = new URL(req.url);
  const isRscRequest = removeBase(url.pathname, basePath).startsWith(
    '/' + rscBase + '/',
  );
  url.pathname = addBase(
    isRscRequest
      ? '/' + rscBase + '/' + encodeRscPath(encodeRoutePath(routePath))
      : routePath,
    basePath,
  );
  url.search = query ?? parsed.query;
  return url;
}
