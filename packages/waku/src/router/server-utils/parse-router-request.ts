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

/** Where `createRscParams` nests the route query inside an RSC url. */
const RSC_QUERY_PARAM = 'query';

type RouterRequest =
  | { type: 'route'; path: string; query: string | undefined }
  | { type: 'slice'; id: string }
  | { type: 'action' };

/**
 * Reads a request the way `waku/router` will, so middleware can match on a
 * route path rather than Waku's RSC url shape: a document request and the RSC
 * request for the same route both report that route.
 *
 * Returns `null` outside `basePath`, or for an RSC url that does not decode.
 * `query` is `undefined` when a fetch RSC input transformer puts the router's
 * params in the request body, out of reach without consuming it.
 *
 * A path rule is an optimistic redirect, not an authorization boundary: it
 * cannot see a client-dispatched action, though a form posted without
 * JavaScript reports as the route it posts to.
 */
export function parseRouterRequest(req: Request): RouterRequest | null {
  const basePath = getBasePath();
  const rscBase = getRscBase();
  const url = new URL(req.url);
  let pathname: string;
  try {
    pathname = removeBase(url.pathname, basePath);
  } catch {
    return null;
  }
  const rscPathPrefix = '/' + rscBase + '/';
  if (!pathname.startsWith(rscPathPrefix)) {
    return {
      type: 'route',
      path: pathnameToRoutePath(pathname),
      query: url.searchParams.toString(),
    };
  }
  const paramsInBody = req.body !== null;
  const query = paramsInBody
    ? undefined
    : (url.searchParams.get(RSC_QUERY_PARAM) ?? '');
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
 * The url that addresses `routePath` the way `req` addressed its own route, so
 * a rewrite returns the kind of response the caller expects: a document for a
 * document request, an RSC payload for an RSC one.
 *
 * Returns `null` when `req` is not a route request, and when it carries the
 * router's params in its body — a redirect drops that body, and `query`
 * replaces the route query alone. Leave such a request as it is.
 */
export function formatRouterRequest(
  req: Request,
  routePath: string,
  query?: string,
): URL | null {
  const parsed = parseRouterRequest(req);
  if (parsed?.type !== 'route' || parsed.query === undefined) {
    return null;
  }
  const basePath = getBasePath();
  const rscBase = getRscBase();
  const url = new URL(req.url);
  const isRscRequest = removeBase(url.pathname, basePath).startsWith(
    '/' + rscBase + '/',
  );
  const canonicalPath = pathnameToRoutePath(routePath);
  url.pathname = addBase(
    isRscRequest
      ? '/' + rscBase + '/' + encodeRscPath(encodeRoutePath(canonicalPath))
      : canonicalPath,
    basePath,
  );
  const nextQuery = query ?? parsed.query;
  if (isRscRequest) {
    url.searchParams.set(RSC_QUERY_PARAM, nextQuery);
  } else {
    url.search = nextQuery;
  }
  return url;
}
