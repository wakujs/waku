import type { RouteProps } from '../isomorphic-utils/route-path.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideRouteIntent,
} from './route-follow.js';
import { getRouteUrl } from './route-url.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

/**
 * A fetch attempt and its intended browser URL, which can differ for a custom
 * 404. `follows` counts preceding fetch-time and render-time follows.
 */
export type RouteAttempt = {
  route: RouteProps;
  url: URL;
  follows: number;
};

/**
 * Fetches one attempt's elements. Return `undefined` only when this Root
 * already has usable content for the attempt. Forward the signal to transport.
 */
export type FetchRoute = (
  attempt: RouteAttempt,
  signal: AbortSignal,
) => Promise<Elements | undefined>;

/**
 * `route` identifies the last fetch/follow attempt. A successful payload's
 * route metadata can identify a different server-rendered destination, which
 * the binding must reconcile before committing.
 */
export type LoadOutcome =
  | {
      type: 'loaded';
      route: RouteProps;
      url: URL;
      elements: Elements;
      follows: number;
    }
  | { type: 'reused'; route: RouteProps; url: URL; follows: number }
  | {
      type: 'failed';
      route: RouteProps;
      url: URL;
      error: unknown;
      follows: number;
    }
  | { type: 'aborted' };

/** A payload-bearing outcome; does not imply that React has committed it. */
export type Loaded = Extract<LoadOutcome, { type: 'loaded' }>;

/**
 * `url` defaults to the requested route's URL. `follows` defaults to zero;
 * pass the preceding count when following a route intent. `has404` enables
 * recovery from HTTP 404s, including missing files on a static host.
 */
export type LoadOptions = {
  signal: AbortSignal;
  has404: boolean;
  url?: URL;
  follows?: number;
};

export const abortable = <T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
): Promise<T> => {
  if (!signal) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) {
      abort();
    } else {
      signal.addEventListener('abort', abort, { once: true });
    }
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};

/**
 * Fetches a route through the supplied callback without merging elements or
 * updating browser state. HTTP 404s follow the custom page within the navigation
 * budget. Cancellation stops waiting even if the callback ignores its signal.
 * The binding reconciles response metadata and observes `INTENT` for navigation
 * requested during rendering, which can finish after this resolves.
 *
 * @example
 * const outcome = await unstable_load(fetchRoute, route, { signal, has404 });
 */
export const load = async (
  fetchRoute: FetchRoute,
  requested: RouteProps,
  opts: LoadOptions,
): Promise<LoadOutcome> => {
  const initialFollows = opts.follows ?? 0;
  const initialUrl = opts.url ?? getRouteUrl(requested);

  const run = async (attempt: RouteAttempt): Promise<LoadOutcome> => {
    if (opts.signal.aborted) {
      return { type: 'aborted' };
    }
    try {
      const elements = await abortable(
        fetchRoute(attempt, opts.signal),
        opts.signal,
      );
      if (opts.signal.aborted) {
        return { type: 'aborted' };
      }
      if (elements === undefined) {
        return { type: 'reused', ...attempt };
      }
      return {
        type: 'loaded',
        route: attempt.route,
        url: attempt.url,
        elements,
        follows: attempt.follows,
      };
    } catch (error) {
      if (opts.signal.aborted) {
        return { type: 'aborted' };
      }
      const decision =
        error instanceof Error &&
        error.cause instanceof Response &&
        error.cause.status === 404
          ? decideRouteIntent({ status: 404 }, attempt, {
              has404: opts.has404,
              maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
            })
          : { type: 'none' as const };
      if (decision.type !== 'follow') {
        return {
          type: 'failed',
          route: attempt.route,
          url: attempt.url,
          error: decision.type === 'stop' ? decision.error : error,
          follows: attempt.follows,
        };
      }
      const nextAttempt = {
        route: decision.target,
        url: decision.url,
        follows: attempt.follows + 1,
      };
      return run(nextAttempt);
    }
  };

  return run({
    route: requested,
    url: initialUrl,
    follows: initialFollows,
  });
};
