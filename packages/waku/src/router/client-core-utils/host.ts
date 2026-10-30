// reload cannot be expressed here (no refetch bit; a same-route navigate would no-op)

import { createContext, useContext } from 'react';
import type { RouteProps } from '../isomorphic-utils/route-path.js';

/**
 * Binding-supplied route snapshot and navigation.
 *
 * Bindings reconcile the response route metadata and observe `INTENT` to
 * follow redirects and custom 404s. Bound that chain with `decideRouteIntent`
 * and `MAX_FOLLOWS_PER_NAVIGATION`, and surface failures. Pass `onBuildIdMismatch`
 * and `onInvalidate` for build-mismatch recovery or leave Minimal's default
 * reload behavior. `navigate` must honor `scroll`.
 */
export type RouterHost = {
  route: RouteProps;
  /**
   * Navigate to `href` (`push` or `replace`). `scroll` is up to the binding when
   * omitted.
   *
   * Resolves once the requested navigation has been handled: after its
   * response when the route needs one, right away when it does not, and when a
   * newer navigation supersedes it. Rejects when the navigation fails.
   * A streamed intent can redirect after this promise resolves.
   */
  navigate: (
    href: string,
    opts: {
      history: 'push' | 'replace';
      scroll?: boolean;
    },
  ) => Promise<void>;
};

export const RouterHostContext = createContext<RouterHost | null>(null);

export const useRouterHost = (): RouterHost => {
  const host = useContext(RouterHostContext);
  if (!host) {
    throw new Error('Missing RouterHost');
  }
  return host;
};
