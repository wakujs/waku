'use client';

import {
  Component,
  Suspense,
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { ReactNode } from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
import {
  type Unstable_FollowDecision as FollowDecision,
  unstable_INTENT_ID as INTENT_ID,
  unstable_MAX_FOLLOWS_PER_NAVIGATION as MAX_FOLLOWS_PER_NAVIGATION,
  unstable_ROUTE_ID as ROUTE_ID,
  type Unstable_RouteIntentData as RouteIntentData,
  type Unstable_RouteProps as RouteProps,
  type Unstable_RouterHost as RouterHost,
  RouterHostContext_UNSTABLE as RouterHostContext,
  type Unstable_ServerFunctionRouting as ServerFunctionRouting,
  unstable_buildMergePatch as buildMergePatch,
  unstable_createServerFunctionRouting as createServerFunctionRouting,
  unstable_decideRouteIntent as decideRouteIntent,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_getRouteUrl as getRouteUrl,
  unstable_has404FromElements as has404FromElements,
  unstable_isStaticFromElements as isStaticFromElements,
  unstable_parseRoute as parseRoute,
  useInitialRoute_UNSTABLE as useInitialRoute,
  useInitialRscParams_UNSTABLE as useInitialRscParams,
  useRouterCache_UNSTABLE as useRouterCache,
  useServerFunctionRouting_UNSTABLE as useServerFunctionRouting,
} from 'waku/router/client-core';
import { settleNavigateFinished } from './settle-navigate-finished.js';

type FollowRun = (
  next: RouteProps,
  signal: AbortSignal,
  follows: number,
  url?: URL,
  adopt?: Promise<Readonly<Record<string | symbol, unknown>>>,
) => Promise<void>;

type LastFollow = { href: string; follows: number };

type FollowHost = {
  ownsNavigation: boolean;
  follows: number;
  setFollows: (n: number | ((n: number) => number)) => void;
  lastFollowRef: { current: LastFollow | null };
  runRef: { current: FollowRun };
};

const FollowHostContext = createContext<FollowHost | null>(null);

const subscribeNever = () => () => {};
const getClientTrue = () => true;
const getServerFalse = () => false;

const FollowRedirect = ({
  decision,
  source,
}: {
  source: unknown;
  decision: Extract<FollowDecision, { type: 'follow' | 'leave' }>;
}) => {
  const { ownsNavigation, follows, setFollows, lastFollowRef, runRef } =
    use(FollowHostContext)!;
  const href = decision.url.href;
  const dispatchedFollowRef = useRef<LastFollow | null>(null);
  const startFollow = useEffectEvent(() => {
    if (decision.type !== 'follow') {
      return;
    }
    const last = lastFollowRef.current;
    if (last && last.href === href && last.follows === follows) {
      return;
    }
    if (last?.href === href && last === dispatchedFollowRef.current) {
      return;
    }
    const dispatch = { href, follows };
    lastFollowRef.current = dispatch;
    dispatchedFollowRef.current = dispatch;
    const nextFollows = follows + 1;
    setFollows(nextFollows);
    if (ownsNavigation) {
      void window.navigation.navigate(href, {
        history: 'replace',
        state: { follows: nextFollows },
        info: { scroll: false, follows: nextFollows, target: decision.target },
      });
      return;
    }
    void runRef.current(
      decision.target,
      new AbortController().signal,
      nextFollows,
      decision.url,
    );
  });
  useEffect(() => {
    if (decision.type === 'leave') {
      window.location.replace(href);
      return;
    }
    startFollow();
  }, [decision.type, href, source]);
  return null;
};

const IntentFollow = ({
  pending,
  route,
  has404,
}: {
  pending: PromiseLike<string | undefined> | undefined;
  route: RouteProps;
  has404: boolean;
}) => {
  const { follows } = use(FollowHostContext)!;
  const [result, setResult] = useState<
    | { pending: typeof pending; value: string }
    | { pending: typeof pending; error: unknown }
  >();
  useEffect(() => {
    if (!pending) {
      return;
    }
    let active = true;
    Promise.resolve(pending).then(
      (value) => {
        if (active && value !== undefined) {
          setResult({ pending, value });
        }
      },
      (error: unknown) => {
        if (active) {
          setResult({ pending, error });
        }
      },
    );
    return () => {
      active = false;
    };
  }, [pending]);
  if (!result || result.pending !== pending) {
    return null;
  }
  if ('error' in result) {
    throw result.error;
  }
  const intent = JSON.parse(result.value) as RouteIntentData;
  if (intent.status === 404 && route.path === '/404') {
    return null;
  }
  const decision = decideRouteIntent(
    intent,
    {
      route,
      url: getRouteUrl(route),
      follows,
    },
    { has404, maxFollows: MAX_FOLLOWS_PER_NAVIGATION },
  );
  if (decision.type === 'stop') {
    throw decision.error;
  }
  if (decision.type === 'none') {
    return <h1>Not Found</h1>;
  }
  return <FollowRedirect decision={decision} source={pending} />;
};

// slot-thrown stop/none must leave this boundary so the fallback can render
class FollowFailure extends Component<
  { children: ReactNode; failure?: { error: unknown } | undefined },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const error = this.props.failure
      ? this.props.failure.error
      : this.state.error;
    if (this.props.failure || error !== null) {
      const message = error instanceof Error ? error.message : String(error);
      const content = <p data-testid="follow-error">{message}</p>;
      return (
        <FollowHostContext.Consumer>
          {(host) =>
            host?.ownsNavigation ? (
              <html>
                <body>{content}</body>
              </html>
            ) : (
              content
            )
          }
        </FollowHostContext.Consumer>
      );
    }
    return this.props.children;
  }
}

const NavBinding = ({
  fallbackRoute,
  serverFunctionRouting,
}: {
  fallbackRoute: RouteProps;
  serverFunctionRouting: ServerFunctionRouting;
}) => {
  const { ownsNavigation, setFollows, lastFollowRef, runRef } =
    use(FollowHostContext)!;
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const cache = useRouterCache();
  const [failure, setFailure] = useState<{ error: unknown }>();
  const routeFallback = useInitialRoute(fallbackRoute);
  const resolvedRef = useRef(elements);
  const settledHrefRef = useRef<string>(undefined);
  useLayoutEffect(() => {
    resolvedRef.current = elements;
    settledHrefRef.current = window.location.href;
  }, [elements]);
  const has404 = has404FromElements(elements);
  // hash-only navigations skip load; the host still has to report the current hash
  const [hash, setHash] = useState('');
  useEffect(() => {
    if (!ownsNavigation) {
      return;
    }
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const sync = () => setHash(window.location.hash);
    sync();
    navigation.addEventListener('currententrychange', sync);
    return () => navigation.removeEventListener('currententrychange', sync);
  }, [ownsNavigation]);
  const route = useMemo((): RouteProps => {
    const fromElements = getRouteFromElements(elements);
    return fromElements ? { ...fromElements, hash } : routeFallback;
  }, [elements, routeFallback, hash]);

  const getSettledRoute = useCallback(
    () => getRouteFromElements(resolvedRef.current) ?? routeFallback,
    [routeFallback],
  );
  // intercept commits the URL before the route loads
  const getPendingRoute = useCallback(
    () =>
      ownsNavigation && window.location.href !== settledHrefRef.current
        ? parseRoute(new URL(window.location.href))
        : undefined,
    [ownsNavigation],
  );
  const applyRouteResponse = useCallback(
    async (responseElements: Readonly<Record<string | symbol, unknown>>) => {
      const next = getRouteFromElements(responseElements)!;
      const current = getSettledRoute();
      const sameRoute =
        current.path === next.path &&
        (isStaticFromElements(responseElements) ||
          current.query === next.query);
      const url =
        sameRoute || next.path === '/404'
          ? new URL(window.location.href)
          : getRouteUrl(next);
      const target = sameRoute ? current : next;
      const adopt = Promise.resolve(responseElements);
      if (ownsNavigation) {
        const result = window.navigation.navigate(url.href, {
          history: sameRoute || next.path === '/404' ? 'replace' : 'push',
          info: { scroll: false, target, adopt },
        });
        await settleNavigateFinished(result.finished);
        return;
      }
      await runRef.current(target, new AbortController().signal, 0, url, adopt);
    },
    [getSettledRoute, ownsNavigation, runRef],
  );
  useServerFunctionRouting(serverFunctionRouting, {
    getSettledRoute,
    getPendingRoute,
    applyRouteResponse,
  });

  const runImpl: FollowRun = async (next, signal, followCount, url, adopt) => {
    setFailure(undefined);
    const base = resolvedRef.current;
    const settled = getRouteFromElements(base) ?? routeFallback;
    const outcome = await cache.load(next, {
      signal,
      has404,
      base,
      follows: followCount,
      ...(url ? { url } : {}),
      ...(adopt ? { adopt } : {}),
    });
    if (outcome.type === 'aborted' || signal.aborted) {
      return;
    }
    if (outcome.type === 'leave') {
      window.location.replace(outcome.location.href);
      return;
    }
    setFollows(outcome.follows);
    if (ownsNavigation && outcome.url.href !== window.location.href) {
      const navigation = window.navigation;
      const entry = navigation.currentEntry;
      const transition = navigation.transition;
      const commitUrl = () => {
        if (signal.aborted || navigation.currentEntry !== entry) {
          return;
        }
        void navigation.navigate(outcome.url.href, {
          history: transition ? 'replace' : 'push',
          info: { urlOnly: true, follows: outcome.follows },
        });
      };
      if (transition) {
        void transition.finished.then(commitUrl, () => {});
      } else {
        commitUrl();
      }
    }
    if (outcome.type === 'failed') {
      setFailure({ error: outcome.error });
      return;
    }
    if (outcome.type === 'reused') {
      await mergeElements({
        [ROUTE_ID]: [outcome.route.path, outcome.route.query],
      });
      return;
    }
    const patch = buildMergePatch(
      { route: outcome.route, elements: outcome.elements },
      resolvedRef.current,
      base,
      { settled },
    );
    await mergeElements(patch);
    cache.learnStaticFromElements(outcome.elements);
  };

  useLayoutEffect(() => {
    runRef.current = runImpl;
  });

  const run = useEffectEvent(runImpl);

  useEffect(() => {
    if (!ownsNavigation) {
      return;
    }
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const onNavigate = (event: NavigateEvent) => {
      if (!event.canIntercept || event.downloadRequest) {
        return;
      }
      const dest = new URL(event.destination.url);
      if (dest.origin !== window.location.origin) {
        return;
      }
      const info = event.info as
        | {
            scroll?: boolean;
            follows?: number;
            urlOnly?: boolean;
            target?: RouteProps;
            adopt?: Promise<Readonly<Record<string | symbol, unknown>>>;
          }
        | undefined;
      // replace is not "redirect"; only our follow metadata continues a chain.
      // a hash-only user navigation never loads, but it is still a fresh chain.
      if (typeof info?.follows === 'number') {
        setFollows(info.follows);
      } else {
        setFollows(0);
        lastFollowRef.current = null;
      }
      if (info?.urlOnly) {
        event.intercept({ scroll: 'manual', focusReset: 'manual' });
        return;
      }
      const next = info?.target ?? parseRoute(dest);
      const current = parseRoute(new URL(window.location.href));
      if (
        !info?.adopt &&
        next.path === current.path &&
        next.query === current.query
      ) {
        return;
      }
      event.intercept({
        handler: () =>
          run(
            next,
            event.signal,
            typeof info?.follows === 'number' ? info.follows : 0,
            dest,
            info?.adopt,
          ),
        // useSetSearch passes scroll: false; intercept defaults to after-transition
        ...(info?.scroll === false ? { scroll: 'manual' } : {}),
        ...(info?.adopt ? { focusReset: 'manual' } : {}),
      });
    };
    navigation.addEventListener('navigate', onNavigate);
    cache.prefetchRoute({ path: '/hello/spike', query: '', hash: '' });
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, [cache, lastFollowRef, ownsNavigation, setFollows]);

  const navigate = useCallback<RouterHost['navigate']>((href, opts) => {
    const result = window.navigation.navigate(href, {
      history: opts.history,
      info: { scroll: opts.scroll },
    });
    return settleNavigateFinished(result.finished);
  }, []);
  const host = useMemo(
    (): RouterHost => ({ route, navigate }),
    [route, navigate],
  );

  const routeSlot = <Slot id={getRouteSlotId(route.path)} />;

  return (
    <RouterHostContext value={host}>
      <FollowFailure key={route.path} failure={failure}>
        <IntentFollow
          pending={
            elements[INTENT_ID] as PromiseLike<string | undefined> | undefined
          }
          route={route}
          has404={has404}
        />
        {ownsNavigation ? <Slot id="root">{routeSlot}</Slot> : routeSlot}
      </FollowFailure>
    </RouterHostContext>
  );
};

export const createNavRouterConfig = () => {
  const serverFunctionRouting = createServerFunctionRouting();
  return {
    serverFunctionRouting,
    rscEnhancers: [serverFunctionRouting.enhancer],
  };
};

export const NavRouter = ({
  ownsNavigation = true,
  initialRoute,
  config,
}: {
  ownsNavigation?: boolean;
  initialRoute?: RouteProps;
  config?: ReturnType<typeof createNavRouterConfig>;
} = {}) => {
  // NavBinding remounts on every merge; this host does not. Entry state is
  // not instance-scoped (`window.navigation` is per document) and intercept
  // runs before the URL commits.
  const [{ serverFunctionRouting, rscEnhancers }] = useState(
    () => config ?? createNavRouterConfig(),
  );
  const [follows, setFollows] = useState(0);
  const lastFollowRef = useRef<LastFollow | null>(null);
  const runRef = useRef<FollowRun>(async () => {});
  const followHost = useMemo(
    (): FollowHost => ({
      ownsNavigation,
      follows,
      setFollows,
      lastFollowRef,
      runRef,
    }),
    [follows, ownsNavigation],
  );
  const [fallback] = useState(
    () => initialRoute ?? parseRoute(new URL(window.location.href)),
  );
  // bounce as an inner initial RSC would HTTP-redirect the document and
  // consume the outer __WAKU_INITIAL_RSC__ payload
  const isClient = useSyncExternalStore(
    subscribeNever,
    getClientTrue,
    getServerFalse,
  );
  const ready = ownsNavigation || isClient;
  const initialRscPath = encodeRoutePath(fallback.path);
  const initialRscParams = useInitialRscParams(initialRscPath, fallback.query);
  if (!ready) {
    return null;
  }
  const root = (
    <Root
      initialRscPath={initialRscPath}
      initialRscParams={initialRscParams}
      rscEnhancers={rscEnhancers}
    >
      <NavBinding
        fallbackRoute={fallback}
        serverFunctionRouting={serverFunctionRouting}
      />
    </Root>
  );
  return (
    <FollowHostContext value={followHost}>
      {ownsNavigation ? null : <p data-testid="follow-count">{follows}</p>}
      {ownsNavigation ? (
        root
      ) : (
        <Suspense fallback="Loading...">{root}</Suspense>
      )}
    </FollowHostContext>
  );
};

export const OwningFollowCount = () => {
  const host = use(FollowHostContext);
  return <p data-testid="owning-follow-count">{host?.follows ?? 0}</p>;
};
