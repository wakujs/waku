import {
  unstable_cancelRender as cancelRender,
  unstable_hasRenderCancellationDigest as hasRenderCancellationDigest,
  unstable_isRenderCancellation as isRenderCancellation,
} from 'waku/minimal/server';
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
import type {
  HandlerInterceptor,
  RouterStore,
} from './define-router-utils/request-store.js';
import { createRouteEntries } from './define-router-utils/route-entries.js';
import type {
  Resolve,
  ResolveElement,
} from './define-router-utils/route-entries.js';
import type { NavigationHref } from './isomorphic-utils/build-route-href.js';
import { pathnameToRoutePath } from './isomorphic-utils/route-path.js';
import { encodeRoutePath } from './isomorphic-utils/router-protocol.js';

export {
  getRequest,
  getRscPath as unstable_getRscPath,
  getRscParams as unstable_getRscParams,
  setNonce as unstable_setNonce,
};
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
 * Renders the route the current server action was called from into its
 * response. The client drops it if the user has left that route by then.
 */
export function unstable_rerenderRoute(): void;
/**
 * Renders a route into the response of the current server action. `pathname`
 * is serialized as a URL pathname, so dot segments are resolved and unescaped
 * non-ASCII characters are percent-encoded. `query` is the search string
 * without `?`, serialized as URL search params, so `q=a b` becomes `q=a+b`.
 */
export function unstable_rerenderRoute(pathname: string, query?: string): void;
export function unstable_rerenderRoute(pathname?: string, query?: string) {
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
 * shell this can produce HTTP 404; after the shell the client shows the view.
 * The first intent recorded for a request wins, including concurrent renders.
 * A server function keeps its normal return value; a form submitted without
 * JavaScript responds with 404.
 */
export function requestNotFound(): void {
  getRouteIntent().record({ status: 404 });
}

/** @deprecated Use `requestNotFound()` and `cancelRender()` to control termination. */
export function unstable_notFound(): never {
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
 * dynamic document's shell this produces an HTTP redirect (303 for a form POST).
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

/** @deprecated Use `requestRedirect()` and `cancelRender()` to control termination. */
export function unstable_redirect(
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
 * emitting a page; `prefetchPattern` is a regular expression matching paths
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
 * Custom 404 availability is checked once per router instance, using
 * `getHas404` when provided or resolving `/404` otherwise.
 * Immutable sources must render the same content for the lifetime of their ID
 * or explicit cache key. Use a bounded set of keys, not arbitrary request paths.
 */
export function unstable_defineRouter(fns: RouterOptions): Handlers {
  const routeEntries = createRouteEntries(
    fns.resolve,
    fns.resolveElement,
    fns.getHas404,
  );
  const runHandled = async <T,>(
    req: Request,
    fn: () => Promise<T>,
    onCancel?: () => Promise<T>,
  ): Promise<T> => {
    const store: RouterStore = { req };
    return runWithRouterStore(store, async () => {
      try {
        return await (fns.unstable_interceptors ?? []).reduceRight(
          (next, interceptor) => () => interceptor(next),
          fn,
        )();
      } catch (error) {
        if (
          !onCancel ||
          (!isRenderCancellation(error) && !hasRenderCancellationDigest(error))
        ) {
          throw error;
        }
        return getRouteIntent().runInContext(() =>
          runWithRouterStore(store, onCancel),
        );
      }
    });
  };
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
