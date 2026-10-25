import {
  type RouteProps,
  pathnameToRoutePath,
} from '../isomorphic-utils/route-path.js';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
import {
  getRouteFromElements,
  has404FromElements,
  isStaticFromElements,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteIntentOutcome } from './observe-route-intent.js';
import {
  getRouteUrl,
  isSameRscRoute,
  parseRedirectUrl,
  redactCredentials,
} from './route-url.js';

/** Bound on one navigation's redirect and custom-404 follow chain. */
export const MAX_FOLLOWS_PER_NAVIGATION = 20;

export type FollowDecision =
  | { type: 'follow'; target: RouteProps; url: URL }
  | { type: 'leave'; url: URL }
  | { type: 'stop'; error: unknown }
  | { type: 'none' };

type FollowRequest = {
  route: Pick<RouteProps, 'path' | 'query'>;
  url: URL;
  follows: number;
};

type FollowOptions = { has404: boolean; maxFollows: number };

export function canReuseForHashRedirect(
  decision: Extract<FollowDecision, { type: 'follow' }>,
  requested: FollowRequest,
  elements: Readonly<Record<string | symbol, unknown>>,
) {
  const rendered = getRouteFromElements(elements);
  return (
    isSameRscRoute(decision.target, requested.route) &&
    decision.url.pathname === requested.url.pathname &&
    decision.url.search === requested.url.search &&
    (!rendered ||
      (rendered.path === decision.target.path &&
        (isStaticFromElements(elements) ||
          rendered.query === decision.target.query)))
  );
}

export function getRouteIntentDecision(
  outcome: RouteIntentOutcome | undefined,
  elements: Readonly<Record<string | symbol, unknown>>,
  requested: FollowRequest,
  has404 = false,
) {
  if (!outcome) {
    return;
  }
  if ('error' in outcome) {
    throw outcome.error;
  }
  if (outcome.value === undefined) {
    return;
  }
  const intent = JSON.parse(outcome.value) as RouteIntentData;
  if (
    intent.status === 404 &&
    getRouteFromElements(elements)?.path === '/404'
  ) {
    return;
  }
  return decideRouteIntent(intent, requested, {
    has404: has404FromElements(elements) || has404,
    maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
  });
}

/**
 * Decides how to follow a decoded `INTENT` value using the triggering route,
 * browser URL and preceding follow count. Absolute destinations leave the
 * document; relative destinations and custom 404s share the follow budget.
 */
export function decideRouteIntent(
  intent: RouteIntentData,
  requested: FollowRequest,
  options: FollowOptions,
): FollowDecision {
  let target: RouteProps;
  let url: URL;
  const location = 'location' in intent ? intent.location : undefined;
  if (location) {
    const parsed = parseRedirectUrl(location, requested.url);
    if (!parsed) {
      return {
        type: 'stop',
        error: new Error(
          `cannot follow a redirect to ${redactCredentials(location)}`,
        ),
      };
    }
    if (!location.startsWith('/') || parsed.origin !== window.location.origin) {
      return { type: 'leave', url: parsed };
    }
    target = {
      path: pathnameToRoutePath(parsed.pathname),
      query: parsed.searchParams.toString(),
      hash: parsed.hash,
    };
    url = getRouteUrl(target);
  } else if (intent.status === 404 && options.has404) {
    target = {
      path: '/404',
      query: requested.url.searchParams.toString(),
      hash: '',
    };
    url = requested.url;
  } else {
    return { type: 'none' };
  }
  if (
    isSameRscRoute(target, requested.route) &&
    url.href === requested.url.href
  ) {
    return {
      type: 'stop',
      error: new Error('detected a navigation loop'),
    };
  }
  if (requested.follows >= options.maxFollows) {
    return {
      type: 'stop',
      error: new Error('too many redirect or 404 follows'),
    };
  }
  return { type: 'follow', target, url };
}
