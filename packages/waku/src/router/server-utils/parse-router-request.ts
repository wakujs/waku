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
 * `path` covers both.
 *
 * `'action'` is a client-dispatched action, addressed by function id with no
 * route attached. A progressively enhanced form submitted without JavaScript
 * is not one of these: it posts to the route's own url and is reported as
 * `'route'`, which is what it addresses. Waku itself only tells the two apart
 * after decoding the body.
 */
type RouterRequest =
  /** A page request: the document, or the RSC payload for the same route. */
  | { type: 'route'; path: string; query: string }
  /** A slice payload request. */
  | { type: 'slice'; id: string }
  /** A client-dispatched server action. Carries no route — see the type docs. */
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
 * `query` is read from the url. An app that registers an
 * `unstable_registerFetchRscInputTransformer` which moves the router's params
 * into the request body gets `query: ''` here, since reading the body would
 * consume it before the handler sees it. `path` is unaffected.
 *
 * A route-matched check here is an optimistic redirect, not an authorization
 * boundary — it cannot cover a client-dispatched `type: 'action'`, and it runs
 * before the router has resolved anything. Enforce authorization where the data
 * is read.
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
  // The client router sends the route query inside a `query` parameter
  // (`createRscParams`), and the server reads it back the same way, so an RSC
  // url's own search string is an envelope, not the route's query.
  const query = url.searchParams.get('query') ?? '';
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
  // `encodeRoutePath` rejects a trailing slash and `/index.html`, which a
  // hand-written redirect table is free to contain, so canonicalize first and
  // keep both url shapes pointing at the same route.
  const canonicalPath = pathnameToRoutePath(routePath);
  url.pathname = addBase(
    isRscRequest
      ? '/' + rscBase + '/' + encodeRscPath(encodeRoutePath(canonicalPath))
      : canonicalPath,
    basePath,
  );
  const nextQuery = query ?? parsed.query;
  // Match how the client router sends a route query for each url shape.
  url.search = isRscRequest
    ? new URLSearchParams({ query: nextQuery }).toString()
    : nextQuery;
  return url;
}
