import {
  startTransition,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from 'waku/minimal/client';
import { useRouterCache } from '../client-core-utils/caches.js';
import { observeRouteIntent } from '../client-core-utils/observe-route-intent.js';
import type { RouteIntentOutcome } from '../client-core-utils/observe-route-intent.js';
import { getRouteIntentDecision } from '../client-core-utils/route-follow.js';
import { parseRoute } from '../client-core-utils/route-url.js';
import {
  INTENT_ID,
  getRouteFromElements,
} from '../isomorphic-utils/router-protocol.js';
import { RouterContext } from './router-context.js';
import { getRouterState } from './router-state.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const RouteIntent = ({
  onError,
}: {
  onError: (error: unknown, source: Elements) => void;
}) => {
  const elements = use(useElementsPromise());
  const router = use(RouterContext);
  const cache = useRouterCache();
  const getElements = router?.getElements;
  const followedStateByPromise = useRef(
    new WeakMap<
      PromiseLike<string | undefined>,
      ReturnType<typeof getRouterState>
    >(),
  );
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const settle = useEffectEvent(
    (
      outcome: RouteIntentOutcome,
      source: Elements,
      pending: PromiseLike<string | undefined>,
    ) => {
      if (!router?.isCurrentRoute?.(source)) {
        return;
      }
      const state = getRouterState(source);
      if (
        followedStateByPromise.current.has(pending) &&
        followedStateByPromise.current.get(pending) === state
      ) {
        return;
      }
      try {
        const sourceRoute = getRouteFromElements(source);
        const requestedUrl = new URL(
          state?.url ?? window.location.href,
          window.location.href,
        );
        const requested = state?.requested;
        const decision = getRouteIntentDecision(outcome, source, {
          route: requested
            ? { path: requested[0], query: requested[1] }
            : (sourceRoute ?? parseRoute(requestedUrl)),
          url: requestedUrl,
          follows: state?.follows ?? 0,
        });
        if (!decision) {
          return;
        }
        followedStateByPromise.current.set(pending, state);
        if (decision.type === 'none') {
          onError(
            new Error('Not Found', {
              cause: new Response(null, { status: 404 }),
            }),
            source,
          );
          return;
        }
        if (decision.type === 'stop') {
          onError(decision.error, source);
          return;
        }
        if (decision.type === 'leave') {
          window.location.replace(decision.url.href);
          return;
        }
        const { target, url } = decision;
        startTransition(() => {
          router
            .changeRoute(target, {
              shouldScroll: state
                ? state.scroll !== null
                : target.path !== sourceRoute?.path,
              history: 'replace',
              refetch: true,
              url,
              follows: (state?.follows ?? 0) + 1,
            })
            .catch((error: unknown) => onError(error, source));
        });
      } catch (error) {
        onError(error, source);
      }
    },
  );

  useEffect(() => {
    const pending = elements[INTENT_ID] as
      PromiseLike<string | undefined> | undefined;
    if (!pending) {
      return;
    }
    return observeRouteIntent(pending, (outcome) => {
      settle(outcome, elements, pending);
    });
  }, [elements]);

  useLayoutEffect(() => {
    if (!getElements) {
      return;
    }
    const unregister = cache.connectRouteIntentObserver((type, signal) => {
      const scope = getRouterState(getElements());
      return (responseElements) => {
        const pending = responseElements[INTENT_ID] as
          PromiseLike<string | undefined> | undefined;
        if (
          !pending ||
          (type !== 'call' && getRouteFromElements(responseElements))
        ) {
          return responseElements;
        }
        observeRouteIntent(pending, (outcome) => {
          if (
            mounted.current &&
            !signal?.aborted &&
            getRouterState(getElements()) === scope
          ) {
            settle(outcome, getElements(), pending);
          }
        });
        return combineElements({}, responseElements, {
          filter: (key) => key !== INTENT_ID,
        });
      };
    });
    return () => {
      unregister();
    };
  }, [cache, getElements]);

  return null;
};
