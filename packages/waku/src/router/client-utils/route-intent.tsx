import {
  startTransition,
  use,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  unstable_combineElements as combineElements,
  useElementsPromise_UNSTABLE as useElementsPromise,
} from 'waku/minimal/client';
// eslint-disable-next-line import/no-restricted-paths -- Per-Root intent observation is private to the router, not a public Minimal enhancer API.
import { INTERNAL_useRegisterRscEnhancer as useRegisterRscEnhancer } from '../../minimal/client-runtime.js';
import {
  MAX_FOLLOWS_PER_NAVIGATION,
  decideRouteIntent,
} from '../client-core-utils/route-follow.js';
import { isSameRscRoute, parseRoute } from '../client-core-utils/route-url.js';
import {
  INTENT_ID,
  getRouteFromElements,
  has404FromElements,
} from '../isomorphic-utils/router-protocol.js';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
import { RouterContext } from './router-context.js';
import { getRouterState } from './router-state.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export const RouteIntent = () => {
  const elements = use(useElementsPromise());
  const router = use(RouterContext);
  const getElements = router?.getElements;
  const getPendingRoute = router?.getPendingRoute;
  const changeRoute = router?.changeRoute;
  const registerRscEnhancer = useRegisterRscEnhancer();
  const followed = useRef(
    new WeakMap<
      PromiseLike<string | undefined>,
      ReturnType<typeof getRouterState>
    >(),
  );
  const mounted = useRef(true);
  const [failure, setFailure] = useState<{ error: unknown }>();
  const [missing, setMissing] = useState<{
    scope: ReturnType<typeof getRouterState>;
  }>();
  const currentScope = getRouterState(elements);
  // A suspended Root merge can hide layout effects without unmounting.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const isCurrent = useEffectEvent((source: Elements) => {
    const pendingRoute = getPendingRoute?.();
    const sourceRoute = getRouteFromElements(source);
    return (
      (!pendingRoute ||
        !sourceRoute ||
        isSameRscRoute(pendingRoute, sourceRoute)) &&
      (!getElements || getElements()[INTENT_ID] === source[INTENT_ID])
    );
  });
  const follow = useEffectEvent(
    (
      value: string,
      source: Elements,
      pending: PromiseLike<string | undefined>,
    ) => {
      const intent = JSON.parse(value) as RouteIntentData;
      const state = getRouterState(source);
      if (
        !changeRoute ||
        !isCurrent(source) ||
        (followed.current.has(pending) &&
          followed.current.get(pending) === state)
      ) {
        return;
      }
      const sourceRoute = getRouteFromElements(source);
      if (intent.status === 404 && sourceRoute?.path === '/404') {
        return;
      }
      followed.current.set(pending, state);
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
        setMissing({ scope: state });
        return;
      }
      if (decision.type === 'stop') {
        setFailure({ error: decision.error });
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
        }).catch((error: unknown) => setFailure({ error }));
      });
    },
  );

  useEffect(() => {
    const pending = elements[INTENT_ID] as
      PromiseLike<string | undefined> | undefined;
    if (!pending) {
      return;
    }
    let active = true;
    Promise.resolve(pending).then(
      (value) => {
        if (active && value !== undefined) {
          follow(value, elements, pending);
        }
      },
      (error: unknown) => {
        if (active && isCurrent(elements)) {
          setFailure({ error });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [elements]);

  useLayoutEffect(() => {
    if (!getElements) {
      return;
    }
    const unregister = registerRscEnhancer(
      (next) => async (path, params, options) => {
        const scope = getRouterState(getElements());
        const result = await next(path, params, options);
        const pending = result.elements[INTENT_ID] as
          PromiseLike<string | undefined> | undefined;
        if (
          !pending ||
          (options.type !== 'call' && getRouteFromElements(result.elements))
        ) {
          return result;
        }
        Promise.resolve(pending).then(
          (value) => {
            if (
              !mounted.current ||
              options.signal?.aborted ||
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
              !options.signal?.aborted &&
              getRouterState(getElements()) === scope &&
              isCurrent(getElements())
            ) {
              setFailure({ error });
            }
          },
        );
        return {
          ...result,
          elements: combineElements({}, result.elements, {
            filter: (key) => key !== INTENT_ID,
          }),
        };
      },
    );
    return () => {
      unregister();
    };
  }, [getElements, registerRscEnhancer]);

  if (failure) {
    throw failure.error;
  }
  if (missing && missing.scope === currentScope) {
    return <h1>Not Found</h1>;
  }
  return null;
};
