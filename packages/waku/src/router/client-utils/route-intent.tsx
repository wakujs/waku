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
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideRouteIntent,
} from '../client-core-utils/route-follow.js';
import { parseRoute } from '../client-core-utils/route-url.js';
import {
  INTENT_ID,
  getRouteFromElements,
  has404FromElements,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
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
  const changeRoute = router?.changeRoute;
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
  const isCurrent = useEffectEvent((source: Elements) => {
    return (
      router?.isCurrentRoute?.(source) ??
      (!getElements || getElements()[INTENT_ID] === source[INTENT_ID])
    );
  });
  const follow = useEffectEvent(
    (
      value: string,
      source: Elements,
      pending: PromiseLike<string | undefined>,
    ) => {
      const state = getRouterState(source);
      if (
        !changeRoute ||
        !isCurrent(source) ||
        (followedStateByPromise.current.has(pending) &&
          followedStateByPromise.current.get(pending) === state)
      ) {
        return;
      }
      try {
        const intent = JSON.parse(value) as RouteIntentData;
        const sourceRoute = getRouteFromElements(source);
        if (intent.status === 404 && sourceRoute?.path === '/404') {
          return;
        }
        followedStateByPromise.current.set(pending, state);
        const requestedUrl = new URL(
          state?.url ?? window.location.href,
          window.location.href,
        );
        const requested = state?.requested;
        const decision = decideRouteIntent(
          intent,
          {
            route: requested
              ? { path: requested[0], query: requested[1] }
              : (sourceRoute ?? parseRoute(requestedUrl)),
            url: requestedUrl,
            follows: state?.follows ?? 0,
          },
          {
            has404: has404FromElements(source),
            maxFollows: MAX_FOLLOWS_PER_NAVIGATION,
          },
        );
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
          changeRoute(target, {
            shouldScroll: state
              ? state.scroll !== null
              : target.path !== sourceRoute?.path,
            history: 'replace',
            refetch: true,
            url,
            follows: (state?.follows ?? 0) + 1,
          }).catch((error: unknown) => onError(error, source));
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
      if (!isCurrent(elements)) {
        return;
      }
      if ('error' in outcome) {
        onError(outcome.error, elements);
      } else if (outcome.value !== undefined) {
        follow(outcome.value, elements, pending);
      }
    });
  }, [elements, onError]);

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
        Promise.resolve(pending).then(
          (value) => {
            if (
              !mounted.current ||
              signal?.aborted ||
              getRouterState(getElements()) !== scope
            ) {
              return;
            }
            if (value !== undefined) {
              follow(value, getElements(), pending);
            }
          },
          (error: unknown) => {
            if (
              mounted.current &&
              !signal?.aborted &&
              getRouterState(getElements()) === scope &&
              isCurrent(getElements())
            ) {
              onError(error, getElements());
            }
          },
        );
        return combineElements({}, responseElements, {
          filter: (key) => key !== INTENT_ID,
        });
      };
    });
    return () => {
      unregister();
    };
  }, [cache, getElements, onError]);

  return null;
};
