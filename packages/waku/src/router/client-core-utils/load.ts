import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { MAX_FOLLOWS_PER_NAVIGATION, decideFollow } from './error-route.js';
import { getRouteUrl, isSameRscRoute } from './route-url.js';

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
 * Fetches one attempt's elements, rejecting with redirect or not-found errors
 * to follow. Return `undefined` only when this Root already has usable content
 * for the attempt, not when a route is missing. Forward the signal to transport.
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
      type: 'external';
      url: URL;
      error: unknown;
      route: RouteProps;
      /** Last attempted browser URL, for applying history before leaving. */
      from: URL;
      follows: number;
    }
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
 * `settled` is the committed route, used to reuse hash-only redirects back to
 * it. `url` defaults to the requested route's URL. `follows` defaults to zero;
 * pass the preceding count when resuming a render-time follow chain.
 */
export type LoadOptions = {
  signal: AbortSignal;
  has404: boolean;
  settled: RouteProps;
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
 * Fetches a route through the supplied callback and follows redirects or a
 * custom 404 within one shared follow budget. `has404` enables following /404
 * while retaining the requested browser URL. Cancellation stops waiting even
 * if the callback ignores its signal; transport may continue in that case.
 * Returns an outcome without merging elements or updating history or scroll.
 * The binding reconciles response route metadata and handles streamed-slot
 * errors, which can occur after this promise resolves.
 *
 * @example
 * const outcome = await unstable_load(fetchRoute, route, { signal, has404, settled });
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
      const decision = decideFollow(error, attempt, {
        has404: opts.has404,
        maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
      });
      if (decision.type === 'leave') {
        return {
          type: 'external',
          url: decision.url,
          error,
          route: attempt.route,
          from: attempt.url,
          follows: attempt.follows,
        };
      }
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
      if (
        initialFollows === 0 &&
        isSameRscRoute(decision.target, attempt.route) &&
        isSameRscRoute(decision.target, opts.settled)
      ) {
        return {
          type: 'reused',
          route: nextAttempt.route,
          url: nextAttempt.url,
          follows: nextAttempt.follows,
        };
      }
      return run(nextAttempt);
    }
  };

  return run({
    route: requested,
    url: initialUrl,
    follows: initialFollows,
  });
};
