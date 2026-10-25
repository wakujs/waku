'use client';

import {
  use,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from 'waku/minimal/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import { useRouterCache } from './client-core-utils/caches.js';
import type { PrefetchOptions } from './client-core-utils/caches.js';
import { RouterHostContext } from './client-core-utils/host.js';
import type { RouterHost } from './client-core-utils/host.js';
import { useInitialRscParams } from './client-core-utils/initial-route.js';
import { parseRoute } from './client-core-utils/route-url.js';
import type { ServerFunctionRouting } from './client-core-utils/server-function-routing.js';
import { createServerFunctionRouting } from './client-core-utils/server-function-routing.js';
import {
  prefetchRouteUnlessReusable,
  preloadRouteModules,
  resolveRouteHref,
} from './client-utils/link.js';
import { useNavigation } from './client-utils/navigation.js';
import {
  MissingRouteHandler,
  RenderErrorHandler,
} from './client-utils/render-error.js';
import {
  RouterContext,
  dispatchChangeRoute,
} from './client-utils/router-context.js';
import { serverRedirectEnhancer } from './client-utils/router-state.js';
import { shouldScrollByDefault } from './client-utils/scroll.js';
import type { NavigationHref } from './isomorphic-utils/build-route-href.js';
import type { RouteProps } from './isomorphic-utils/route-path.js';
import {
  encodeRoutePath,
  getRouteSlotId,
} from './isomorphic-utils/router-protocol.js';

export { ErrorBoundary } from './client-core-utils/error-boundary.js';
export { useParams_UNSTABLE } from './client-core-utils/route-hooks.js';
export {
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from './client-core-utils/search.js';
export { Slice } from './client-core-utils/slice.js';
export { Link, useNavigationStatus_UNSTABLE } from './client-utils/link.js';
export type { LinkProps } from './client-utils/link.js';

type NavigateOptions = {
  /**
   * Whether the link should scroll on navigation.
   * - `true`: always scroll
   * - `false`: never scroll
   * - `undefined`: scroll on path/hash change (not on query-only change)
   */
  scroll?: boolean;
  /**
   * Commit instantly: paint the cached shell + its `<Suspense>` fallbacks right
   * away and stream the dynamic parts in, instead of waiting for the response.
   */
  unstable_instant?: boolean;
  /**
   * Called when a newer navigation, such as a `<Link>` click, another `push`,
   * `reload()`, or back/forward, cancels this one while its response is pending.
   * An instant navigation can already have painted its shell. Accepted
   * responses are not cancelled while their components finish rendering.
   */
  unstable_onSuperseded?: () => void;
};

/**
 * Resolves once the requested navigation has been handled: after its response
 * when the route needs one, right away when it does not, and when a newer
 * navigation supersedes it (see `unstable_onSuperseded`). Rejects when the
 * navigation fails, when a redirect hands the page to the browser, and when no
 * custom 404 route can answer a missing route. A redirect or 404 received while
 * fetching is followed before this resolves. It does not wait for React to
 * render, so the address bar may still show the previous URL.
 */
type Navigate = (
  to: NavigationHref,
  options?: NavigateOptions,
) => Promise<void>;

/**
 * Fetches whatever it is given, including the route already on screen, so it
 * can warm the cache for a later reload. `<Link>` prefetching is automatic and
 * skips a target the router is already showing.
 */
type Prefetch = (to: NavigationHref, options?: PrefetchOptions) => void;

const useRouterOrThrow = () => {
  const router = useContext(RouterContext);
  if (!router) {
    throw new Error('Missing Router');
  }
  return router;
};

/**
 * Current route fields plus navigation helpers (`push`, `replace`, `reload`,
 * `back`, `forward`, `prefetch`).
 *
 * `push` / `replace` settle as described on their return type: handled
 * navigation, not paint-finished. `reload` refetches the current location.
 * `prefetch` warms a route for a later navigation or reload; `<Link>`
 * prefetching is automatic and skips the route already on screen.
 */
export function useRouter() {
  const router = useRouterOrThrow();
  const { route, changeRoute, getElements } = router;
  const cache = useRouterCache();
  const navigate = useCallback(
    (
      history: 'push' | 'replace',
      to: NavigationHref,
      options?: NavigateOptions,
    ) => {
      const url = new URL(resolveRouteHref(to), window.location.href);
      return dispatchChangeRoute(changeRoute, parseRoute(url), {
        shouldScroll: options?.scroll ?? shouldScrollByDefault(url),
        history,
        url,
        instant: options?.unstable_instant,
        onSuperseded: options?.unstable_onSuperseded,
      });
    },
    [changeRoute],
  );
  const push = useCallback<Navigate>(
    (to, options) => navigate('push', to, options),
    [navigate],
  );
  const replace = useCallback<Navigate>(
    (to, options) => navigate('replace', to, options),
    [navigate],
  );
  const reload = useCallback(async () => {
    const url = new URL(window.location.href);
    await dispatchChangeRoute(changeRoute, parseRoute(url), {
      shouldScroll: true,
      refetch: true,
      history: 'replace',
      url, // reloading moves nothing
    });
  }, [changeRoute]);
  const back = useCallback(() => {
    window.history.back();
  }, []);
  const forward = useCallback(() => {
    window.history.forward();
  }, []);
  const prefetch = useCallback<Prefetch>(
    (to, options) => {
      const url = new URL(resolveRouteHref(to), window.location.href);
      const next = parseRoute(url);
      preloadRouteModules(next.path);
      prefetchRouteUnlessReusable(cache, next, options, getElements);
    },
    [cache, getElements],
  );
  return {
    ...route,
    push,
    replace,
    reload,
    back,
    forward,
    prefetch,
  };
}

const createServerStub = (name: string) => () => {
  throw new Error(`${name} is not in the server`);
};

const ThrowError = ({ error }: { error: unknown }) => {
  throw error;
};

const InnerRouter = ({
  serverFunctionRouting,
  fallbackRoute,
  routeInterceptor,
}: {
  serverFunctionRouting: ServerFunctionRouting;
  fallbackRoute: RouteProps;
  routeInterceptor: ((route: RouteProps) => RouteProps | false) | undefined;
}) => {
  const elementsPromise = useElementsPromise();
  const elements = use(elementsPromise);
  const {
    route: currentRoute,
    changeRoute,
    getElements,
    error: navigationError,
  } = useNavigation(
    elements,
    fallbackRoute,
    routeInterceptor,
    serverFunctionRouting,
  );

  const navigate = useCallback<RouterHost['navigate']>(
    (href, opts) => {
      const url = new URL(href, window.location.href);
      return dispatchChangeRoute(changeRoute, parseRoute(url), {
        shouldScroll: opts.scroll ?? shouldScrollByDefault(url),
        history: opts.history,
        url,
      });
    },
    [changeRoute],
  );
  const host = useMemo(
    (): RouterHost => ({ route: currentRoute, navigate }),
    [currentRoute, navigate],
  );

  const routeElement = navigationError ? (
    <ThrowError error={navigationError.error} />
  ) : (
    <Slot id={getRouteSlotId(currentRoute.path)} />
  );
  // TODO a followable error thrown by the root layout, or by a server function
  // it calls, is not followed. The layout's own ErrorBoundary catches it first,
  // so wrapping this slot in another handler does not reach it
  const rootElement = (
    <Slot id="root">
      <RenderErrorHandler>{routeElement}</RenderErrorHandler>
    </Slot>
  );
  return (
    <RouterContext
      value={{
        route: currentRoute,
        changeRoute,
        getElements,
      }}
    >
      <RouterHostContext value={host}>{rootElement}</RouterHostContext>
    </RouterContext>
  );
};

const EMPTY_RSC_ENHANCERS: readonly Unstable_RscEnhancer[] = [];
const mountedServerFunctionRoutings: ServerFunctionRouting[] = [];
const serverFunctionRoutingEnhancer: Unstable_RscEnhancer =
  (next) => (rscPath, rscParams, options) => {
    if (options.type !== 'call') {
      return next(rscPath, rscParams, options);
    }
    const serverFunctionRouting = mountedServerFunctionRoutings.at(-1);
    if (!serverFunctionRouting) {
      throw new Error(
        'Server function routing is not connected. Call mount-time server functions from useEffect, not useLayoutEffect.',
      );
    }
    return serverFunctionRouting.enhancer(next)(rscPath, rscParams, options);
  };
const routerRscEnhancers = new WeakMap<
  readonly Unstable_RscEnhancer[],
  readonly Unstable_RscEnhancer[]
>();

const getRouterRscEnhancers = (enhancers: readonly Unstable_RscEnhancer[]) => {
  let pipeline = routerRscEnhancers.get(enhancers);
  if (!pipeline) {
    pipeline = [
      ...enhancers,
      serverRedirectEnhancer,
      serverFunctionRoutingEnhancer,
    ];
    routerRscEnhancers.set(enhancers, pipeline);
  }
  return pipeline;
};

/**
 * Client router root. Each instance provides navigation state to its
 * descendants. Instances can start from different `initialRoute` values, but
 * navigation uses the document's shared URL and history. Server function
 * calls use the most recently mounted Minimal Root. `initialRoute` defaults
 * to the current browser location.
 */
export function Router({
  initialRoute = parseRoute(new URL(window.location.href)),
  unstable_routeInterceptor,
  unstable_rscEnhancers = EMPTY_RSC_ENHANCERS,
}: {
  initialRoute?: RouteProps;
  /**
   * Initial input and transport enhancers, last entry outermost. Snapshotted
   * once per mount; keep the array reference stable across renders, including
   * initial Suspense retries. Create it before rendering React and remount to
   * change it with a new array. Router redirect and server function routing wrap this
   * list, so result caches here do not retain their reconciled metadata.
   */
  unstable_rscEnhancers?: readonly Unstable_RscEnhancer[];
  /**
   * Intercepts browser history navigation (back/forward) before it commits;
   * programmatic navigation and `Link` clicks are not intercepted. Return
   * `false` to ignore the pop (the address bar has already moved); otherwise
   * return the route to render.
   */
  unstable_routeInterceptor?: (route: RouteProps) => RouteProps | false;
}) {
  const [serverFunctionRouting] = useState(createServerFunctionRouting);
  const [rscEnhancers] = useState(() =>
    getRouterRscEnhancers(unstable_rscEnhancers),
  );
  useLayoutEffect(() => {
    mountedServerFunctionRoutings.push(serverFunctionRouting);
    return () => {
      mountedServerFunctionRoutings.splice(
        mountedServerFunctionRoutings.lastIndexOf(serverFunctionRouting),
        1,
      );
    };
  }, [serverFunctionRouting]);
  const initialRscPath = encodeRoutePath(initialRoute.path);
  const initialRscParams = useInitialRscParams(
    initialRscPath,
    initialRoute.query,
  );
  return (
    <Root
      initialRscPath={initialRscPath}
      initialRscParams={initialRscParams}
      rscEnhancers={rscEnhancers}
    >
      <MissingRouteHandler>
        <InnerRouter
          serverFunctionRouting={serverFunctionRouting}
          fallbackRoute={initialRoute}
          routeInterceptor={unstable_routeInterceptor}
        />
      </MissingRouteHandler>
    </Root>
  );
}

export function INTERNAL_ServerRouter({ route }: { route: RouteProps }) {
  const routeElement = <Slot id={getRouteSlotId(route.path)} />;
  const rootElement = <Slot id="root">{routeElement}</Slot>;
  return (
    <RouterContext
      value={{
        route,
        changeRoute: createServerStub('changeRoute'),
      }}
    >
      <RouterHostContext
        value={{
          route,
          navigate: createServerStub('navigate'),
        }}
      >
        {rootElement}
      </RouterHostContext>
    </RouterContext>
  );
}
