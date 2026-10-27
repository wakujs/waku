import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import type { Unstable_Handlers as Handlers } from 'waku/minimal/server';
import { createBuildHandler } from './define-router-utils/build-handler.js';
import type {
  BuildElementId,
  BuildPath,
} from './define-router-utils/build-handler.js';
import { createRequestHandler } from './define-router-utils/request-handler.js';
import {
  getRequest,
  getRerender,
  getRouteIntent,
  getRscParams,
  getRscPath,
  runWithRouterStore,
  setNonce,
} from './define-router-utils/request-store.js';
import type { HandlerInterceptor } from './define-router-utils/request-store.js';
import { createRouteEntries } from './define-router-utils/route-entries.js';
import type {
  Resolve,
  ResolveElement,
} from './define-router-utils/route-entries.js';
import type { NavigationHref } from './isomorphic-utils/build-route-href.js';
import { pathnameToRoutePath } from './isomorphic-utils/route-path.js';
import { encodeRoutePath } from './isomorphic-utils/router-protocol.js';

export { getRequest, getRscPath, getRscParams, setNonce };
export type { HandlerInterceptor };

const encodePathname = (pathname: string) => {
  if (!pathname.startsWith('/')) {
    throw new Error('Pathname must start with `/`: ' + pathname);
  }
  const url = new URL('http://localhost');
  url.pathname = pathname;
  return url.pathname;
};

/**
 * Schedules the calling route to render after the server function finishes,
 * unless a route intent was recorded. The client drops the rerender if the user
 * has left that route or any navigation is pending.
 */
export function rerenderRoute(): void;
/**
 * Schedules a route to render after the current server function finishes.
 * A recorded route intent skips scheduled renders. `pathname`
 * is serialized as a URL pathname, so dot segments are resolved and unescaped
 * non-ASCII characters are percent-encoded. `query` is the search string
 * without `?`, serialized as URL search params, so `q=a b` becomes `q=a+b`.
 */
export function rerenderRoute(pathname: string, query?: string): void;
export function rerenderRoute(pathname?: string, query?: string) {
  if (pathname === undefined) {
    getRerender()();
    return;
  }
  const rscPath = encodeRoutePath(
    pathnameToRoutePath(encodePathname(pathname)),
  );
  const encodedQuery = new URLSearchParams(query).toString();
  getRerender()(
    rscPath,
    encodedQuery && new URLSearchParams({ query: encodedQuery }),
  );
}

/**
 * Requests the not-found view without terminating execution. Return from the
 * current component or server function after calling it. Before the document
 * response is returned this can produce HTTP 404; after the shell the client
 * shows the view.
 * The first intent recorded for a request wins, including concurrent renders.
 * A server function keeps its normal return value; a form submitted without
 * JavaScript responds with 404.
 */
export function requestNotFound(): void {
  getRouteIntent().record({ status: 404 });
}

/**
 * @deprecated Use `requestNotFound()` and `cancelRender()` to control termination.
 * In handler interceptors, use `requestNotFound()` and return `next()`.
 * An uncaught cancellation there returns HTTP 204 or an empty RSC payload.
 */
export function notFound(): never {
  requestNotFound();
  cancelRender();
}

const getRedirectLocation = (
  to: NavigationHref | `http://${string}` | `https://${string}` | URL,
) => {
  let location = to instanceof URL ? to.href : to;
  const leavesTheApp =
    location.startsWith('http://') || location.startsWith('https://');
  if (
    leavesTheApp
      ? !URL.canParse(location)
      : !location.startsWith('/') || location.startsWith('//')
  ) {
    throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
  }
  if (leavesTheApp) {
    const url = new URL(location);
    url.username = '';
    url.password = '';
    location = url.href;
  }
  for (let i = 0; i < location.length; ++i) {
    const charCode = location.charCodeAt(i);
    const isBackslash = charCode === 0x5c;
    if (
      charCode < 0x20 ||
      charCode === 0x7f ||
      (isBackslash && !leavesTheApp)
    ) {
      throw new Error(`Invalid redirect location: ${JSON.stringify(location)}`);
    }
  }
  return location;
};

/**
 * Requests navigation without terminating execution. Return explicitly after
 * calling it. Accepts an app-relative path or an absolute HTTP(S) URL; validate
 * destinations derived from user input against your own allowlist. Before a
 * dynamic document response is returned this produces an HTTP redirect
 * (303 for a form POST).
 * After the shell, and for prerendered pages, the browser follows the intent
 * using JavaScript.
 * An absolute URL navigates the document even when it names this origin.
 * The first intent recorded for a request wins, including concurrent renders.
 */
export function requestRedirect(
  to: NavigationHref | `http://${string}` | `https://${string}` | URL,
  status: 303 | 307 | 308 = 307,
): void {
  const intent = getRouteIntent();
  if (!intent.value) {
    intent.record({ status, location: getRedirectLocation(to) });
  }
}

/**
 * @deprecated Use `requestRedirect()` and `cancelRender()` to control termination.
 * In handler interceptors, use `requestRedirect()` and return `next()`.
 * An uncaught cancellation there returns HTTP 204 or an empty RSC payload.
 */
export function redirect(
  to: NavigationHref | `http://${string}` | `https://${string}` | URL,
  status: 303 | 307 | 308 = 307,
): never {
  requestRedirect(to, status);
  cancelRender();
}

type RouterOptions = {
  resolve: Resolve;
  getBuildPaths?: () => Promise<Iterable<BuildPath>>;
  getBuildElementIds?: () => Promise<Iterable<BuildElementId>>;
  resolveElement?: ResolveElement;
  getHas404?: () => Promise<boolean>;
  unstable_interceptors?: HandlerInterceptor[];
};

/**
 * Creates server handlers for `waku/router/client`. `resolve` receives the
 * normalized pathname and query string without `?`, and returns a router
 * definition with `root` and `route` element sources, an HTTP handler, or
 * `null` for not found. The document root uses `Children_UNSTABLE` to place
 * the active route.
 *
 * `getBuildPaths` lists pathnames to resolve, or explicit
 * `{ pathname, routerDefinition }` targets. Immutable routes are prerendered,
 * HTTP handlers emit static responses, and mutable routes cache only immutable
 * elements. A target's `prerender: false` caches immutable sources without
 * emitting a page; `prefetchRegExp` is a regular expression matching paths
 * that share its client modules.
 * `resolveElement` handles `slice:<id>` requests from client `Slice`
 * components; `getBuildElementIds` lists immutable IDs to emit as standalone
 * RSC files, as strings to resolve or `{ id, source }` targets.
 * Only `slice:<id>` IDs are supported for standalone requests.
 * Unresolved or mutable build IDs fail the build.
 * An immutable source's optional `cacheKey` shares its cached content across
 * slot IDs. Whole-route client reuse requires every source to be immutable
 * and cached, with request-independent metadata. Unkeyed route content can
 * qualify after a production build preloads it; development has no build cache.
 * `createPages` and `fsRouter` supply route cache keys automatically.
 * Raw routers must supply `getHas404` to enable their custom 404 page.
 * The callback is queried when route metadata or a fallback needs availability;
 * `createPages` and `fsRouter` supply it from their route registry.
 * Immutable sources must render the same content for the lifetime of their ID
 * or explicit cache key. Use a bounded set of keys, not arbitrary request paths.
 */
export function defineRouter(fns: RouterOptions): Handlers {
  const routeEntries = createRouteEntries(
    fns.resolve,
    fns.resolveElement,
    fns.getHas404,
  );
  const runHandled = <T,>(req: Request, fn: () => Promise<T>): Promise<T> =>
    runWithRouterStore({ req }, () =>
      (fns.unstable_interceptors ?? []).reduceRight(
        (next, interceptor) => () => interceptor(next),
        fn,
      )(),
    );
  return {
    handleRequest: createRequestHandler({
      resolve: fns.resolve,
      routeEntries,
      runHandled,
      hasInterceptors: () => !!fns.unstable_interceptors?.length,
    }),
    handleBuild: createBuildHandler({
      resolve: fns.resolve,
      getBuildPaths: fns.getBuildPaths,
      getBuildElementIds: fns.getBuildElementIds,
      routeEntries,
      runHandled,
    }),
  };
}
