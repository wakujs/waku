import type { RouteProps } from '../isomorphic-utils/route-path.js';
import { INTENT_ID } from '../isomorphic-utils/router-protocol.js';
import { getRouteIntentOutcome } from './observe-route-intent.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  canReuseForHashRedirect,
  decideRouteIntent,
  getRouteIntentDecision,
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
 * already has usable content for the attempt. An empty record cancels the
 * update, preserving the active route. Forward the signal to transport.
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
      /** Already followed; bindings must skip this promise's post-commit intent. */
      followedIntent?: PromiseLike<string | undefined>;
    }
  | { type: 'reused'; route: RouteProps; url: URL; follows: number }
  | {
      type: 'failed';
      route: RouteProps;
      url: URL;
      error: unknown;
      follows: number;
    }
  | { type: 'aborted' }
  | { type: 'leave'; url: URL; follows: number; location: URL };

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

export const rejectOnAbort = <T>(
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
 * updating browser state. Ready intents and HTTP 404s follow within the navigation
 * budget before returning a payload. `leave` carries the attempted `url` and
 * external `location`; the binding commits history before replacing the document.
 * Cancellation stops waiting even if the callback ignores its
 * signal. Pending intents do not delay loading; the binding observes them after
 * committing and reconciles the final response's route metadata.
 * Fragment-only redirects retain the response and return `followedIntent`;
 * bindings must suppress its replay for this activation, including hash changes.
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
      const elements = await rejectOnAbort(
        fetchRoute(attempt, opts.signal),
        opts.signal,
      );
      if (opts.signal.aborted) {
        return { type: 'aborted' };
      }
      if (elements && Reflect.ownKeys(elements).length === 0) {
        return { type: 'aborted' };
      }
      if (elements === undefined) {
        return { type: 'reused', ...attempt };
      }
      const pending = elements[INTENT_ID] as
        PromiseLike<string | undefined> | undefined;
      if (pending) {
        const outcome = await getRouteIntentOutcome(pending);
        if (opts.signal.aborted) {
          return { type: 'aborted' };
        }
        const decision = getRouteIntentDecision(
          outcome,
          elements,
          attempt,
          opts.has404,
        );
        if (decision?.type === 'follow') {
          if (canReuseForHashRedirect(decision, attempt, elements)) {
            return {
              type: 'loaded',
              route: decision.target,
              url: decision.url,
              elements,
              follows: attempt.follows + 1,
              followedIntent: pending,
            };
          }
          return run({
            route: decision.target,
            url: decision.url,
            follows: attempt.follows + 1,
          });
        }
        if (decision?.type === 'leave') {
          return {
            type: 'leave',
            url: attempt.url,
            follows: attempt.follows,
            location: decision.url,
          };
        }
        if (decision?.type === 'none') {
          throw new Error('Not Found', {
            cause: new Response(null, { status: 404 }),
          });
        }
        if (decision?.type === 'stop') {
          throw decision.error;
        }
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
