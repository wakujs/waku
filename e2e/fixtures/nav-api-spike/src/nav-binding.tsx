'use client';

import {
  Component,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
  unstable_getErrorInfo as getErrorInfo,
  useElementsPromise_UNSTABLE as useElementsPromise,
  useMergeElements_UNSTABLE as useMergeElements,
} from 'waku/minimal/client';
import {
  unstable_ROUTE_ID as ROUTE_ID,
  type Unstable_RouteProps as RouteProps,
  type Unstable_RouterHost as RouterHost,
  unstable_RouterHostContext as RouterHostContext,
  unstable_buildMergePatch as buildMergePatch,
  unstable_encodeRoutePath as encodeRoutePath,
  unstable_getRouteFromElements as getRouteFromElements,
  unstable_getRouteSlotId as getRouteSlotId,
  unstable_has404FromElements as has404FromElements,
  unstable_learnStaticFromElements as learnStaticFromElements,
  unstable_load as load,
  unstable_parseRoute as parseRoute,
  unstable_prefetchRoute as prefetchRoute,
  useInitialRoute_UNSTABLE as useInitialRoute,
  useInitialRscParams_UNSTABLE as useInitialRscParams,
} from 'waku/router/client-core';
import { settleNavigateFinished } from './settle-navigate-finished.js';

const FollowRedirect = ({ error }: { error: unknown }) => {
  const location = getErrorInfo(error)?.location;
  useEffect(() => {
    if (!location) {
      return;
    }
    void window.navigation.navigate(location, { history: 'replace' });
  }, [location]);
  if (!location) {
    throw error;
  }
  return null;
};

// the fetch can succeed with the throwing page still in the payload
class FollowBoundary extends Component<
  { children: ReactNode },
  { error: unknown | null }
> {
  state: { error: unknown | null } = { error: null };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    const { error } = this.state;
    if (error !== null) {
      return <FollowRedirect error={error} />;
    }
    return this.props.children;
  }
}

const NavBinding = ({ fallbackRoute }: { fallbackRoute: RouteProps }) => {
  const elements = use(useElementsPromise());
  const mergeElements = useMergeElements();
  const routeFallback = useInitialRoute(fallbackRoute);
  const resolvedRef = useRef(elements);
  useLayoutEffect(() => {
    resolvedRef.current = elements;
  }, [elements]);
  const has404 = has404FromElements(elements);
  // hash-only navigations skip load; the host still has to report the current hash
  const [hash, setHash] = useState('');
  useEffect(() => {
    const navigation = window.navigation;
    if (!navigation) {
      return;
    }
    const sync = () => setHash(window.location.hash);
    sync();
    navigation.addEventListener('currententrychange', sync);
    return () => navigation.removeEventListener('currententrychange', sync);
  }, []);
  const route = useMemo((): RouteProps => {
    const fromElements = getRouteFromElements(elements);
    return fromElements ? { ...fromElements, hash } : routeFallback;
  }, [elements, routeFallback, hash]);

  const run = useEffectEvent(async (next: RouteProps, signal: AbortSignal) => {
    const base = resolvedRef.current;
    const settled = getRouteFromElements(base) ?? routeFallback;
    const outcome = await load(next, { signal, has404, settled, base });
    if (outcome.type === 'aborted') {
      return;
    }
    if (outcome.type === 'external') {
      window.location.replace(outcome.url.href);
      throw outcome.error;
    }
    if (outcome.type === 'failed') {
      throw outcome.error;
    }
    // intercept already committed the requested URL; a follow must rewrite this entry
    if (outcome.url.href !== window.location.href) {
      window.history.replaceState(null, '', outcome.url.href);
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
    learnStaticFromElements(outcome.elements);
  });

  useEffect(() => {
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
      const next = parseRoute(dest);
      const current = parseRoute(new URL(window.location.href));
      if (next.path === current.path && next.query === current.query) {
        return;
      }
      const info = event.info as { scroll?: boolean } | undefined;
      event.intercept({
        handler: () => run(next, event.signal),
        // useSetSearch passes scroll: false; intercept defaults to after-transition
        ...(info?.scroll === false ? { scroll: 'manual' } : {}),
      });
    };
    navigation.addEventListener('navigate', onNavigate);
    prefetchRoute({ path: '/hello/spike', query: '', hash: '' });
    return () => navigation.removeEventListener('navigate', onNavigate);
  }, []);

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

  return (
    <RouterHostContext value={host}>
      <Slot id="root">
        <FollowBoundary key={route.path}>
          <Slot id={getRouteSlotId(route.path)} />
        </FollowBoundary>
      </Slot>
    </RouterHostContext>
  );
};

export const NavRouter = () => {
  const [fallback] = useState(() => parseRoute(new URL(window.location.href)));
  const initialRscPath = encodeRoutePath(fallback.path);
  const initialRscParams = useInitialRscParams(initialRscPath, fallback.query);
  return (
    <Root initialRscPath={initialRscPath} initialRscParams={initialRscParams}>
      <NavBinding fallbackRoute={fallback} />
    </Root>
  );
};
