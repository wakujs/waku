'use client';

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
  Fragment,
} from 'react';
import type { ComponentProps, FunctionComponent, ReactNode } from 'react';

import { Root, Slot, useRefetch } from '../client.js';
import { getComponentIds, getInputString, SHOULD_SKIP_ID } from './common.js';
import type { RouteProps, ShouldSkip } from './common.js';
// FIXME this depends on an internal function
import { encodeInput } from '../lib/renderers/utils.js';

const parseLocation = (): RouteProps => {
  const { pathname, search } = window.location;
  return { path: pathname, searchParams: new URLSearchParams(search) };
};

type ChangeLocation = (
  path?: string,
  searchParams?: URLSearchParams,
  mode?: 'push' | 'replace' | false,
) => void;

type PrefetchLocation = (path: string, searchParams: URLSearchParams) => void;

const RouterContext = createContext<{
  loc: ReturnType<typeof parseLocation>;
  changeLocation: ChangeLocation;
  prefetchLocation: PrefetchLocation;
} | null>(null);

export function useChangeLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    return () => {
      throw new Error('Missing Router');
    };
  }
  return value.changeLocation;
}

export function useLocation() {
  const value = useContext(RouterContext);
  if (!value) {
    throw new Error('Missing Router');
  }
  return value.loc;
}

export function Link({
  href,
  children,
  pending,
  notPending,
  unstable_prefetchOnEnter,
}: {
  href: string;
  children: ReactNode;
  pending?: ReactNode;
  notPending?: ReactNode;
  unstable_prefetchOnEnter?: boolean;
}) {
  const value = useContext(RouterContext);
  const changeLocation = value
    ? value.changeLocation
    : () => {
        throw new Error('Missing Router');
      };
  const prefetchLocation = value
    ? value.prefetchLocation
    : () => {
        throw new Error('Missing Router');
      };
  const [isPending, startTransition] = useTransition();
  const onClick = (event: MouseEvent) => {
    event.preventDefault();
    const url = new URL(href, window.location.href);
    if (url.href !== window.location.href) {
      prefetchLocation(url.pathname, url.searchParams);
      startTransition(() => {
        changeLocation(url.pathname, url.searchParams);
      });
    }
  };
  const onMouseEnter = unstable_prefetchOnEnter
    ? () => {
        const url = new URL(href, window.location.href);
        if (url.href !== window.location.href) {
          prefetchLocation(url.pathname, url.searchParams);
        }
      }
    : undefined;
  const ele = createElement('a', { href, onClick, onMouseEnter }, children);
  if (isPending && pending !== undefined) {
    return createElement(Fragment, null, ele, pending);
  }
  if (!isPending && notPending !== undefined) {
    return createElement(Fragment, null, ele, notPending);
  }
  return ele;
}

let shouldSkip: ShouldSkip | undefined;
const getSkipList = (
  componentIds: readonly string[],
  props: RouteProps,
  cached: Record<string, RouteProps>,
): string[] => {
  if (!shouldSkip) {
    const ele = document.getElementById('__WAKU_ROUTER_SHOULD_SKIP__');
    if (!ele) {
      return [];
    }
    shouldSkip = JSON.parse(ele.textContent!);
  }
  return [
    ...componentIds.filter((id) => {
      const prevProps = cached[id];
      if (!prevProps) {
        return false;
      }
      const shouldCheck = shouldSkip?.[id];
      if (!shouldCheck) {
        return false;
      }
      if (shouldCheck.path && props.path !== prevProps.path) {
        return false;
      }
      if (
        shouldCheck.keys?.some(
          (key) =>
            props.searchParams.get(key) !== prevProps.searchParams.get(key),
        )
      ) {
        return false;
      }
      return true;
    }),
    SHOULD_SKIP_ID,
  ];
};

function InnerRouter({ basePath }: { basePath: string }) {
  const refetch = useRefetch();

  const [loc, setLoc] = useState(parseLocation);
  const componentIds = getComponentIds(loc.path);

  const [cached, setCached] = useState<Record<string, RouteProps>>(() => {
    return Object.fromEntries(componentIds.map((id) => [id, loc]));
  });
  const cachedRef = useRef(cached);
  useEffect(() => {
    cachedRef.current = cached;
  }, [cached]);

  const changeLocation: ChangeLocation = useCallback(
    (path, searchParams, mode = 'push') => {
      const url = new URL(window.location.href);
      if (path) {
        url.pathname = path;
      }
      if (searchParams) {
        url.search = '?' + searchParams.toString();
      }
      if (mode === 'replace') {
        window.history.replaceState(window.history.state, '', url);
      } else if (mode === 'push') {
        window.history.pushState(window.history.state, '', url);
      }
      const loc = parseLocation();
      setLoc(loc);
      const componentIds = getComponentIds(loc.path);
      const skip = getSkipList(componentIds, loc, cachedRef.current);
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is cached
      }
      const input = getInputString(loc.path, loc.searchParams, skip);
      refetch(input);
      setCached((prev) => ({
        ...prev,
        ...Object.fromEntries(
          componentIds.flatMap((id) => (skip.includes(id) ? [] : [[id, loc]])),
        ),
      }));
    },
    [refetch],
  );

  const prefetchLocation: PrefetchLocation = useCallback(
    (path, searchParams) => {
      const componentIds = getComponentIds(path);
      const routeProps: RouteProps = { path, searchParams };
      const skip = getSkipList(componentIds, routeProps, cachedRef.current);
      if (componentIds.every((id) => skip.includes(id))) {
        return; // everything is cached
      }
      const input = getInputString(path, searchParams, skip);
      const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
      if (!prefetched[input]) {
        prefetched[input] = fetch(basePath + encodeInput(input));
      }
      (globalThis as any).__WAKU_ROUTER_PREFETCH__?.(path, searchParams);
    },
    [basePath],
  );

  useEffect(() => {
    const callback = () => {
      const loc = parseLocation();
      prefetchLocation(loc.path, loc.searchParams);
      changeLocation(loc.path, loc.searchParams, false);
    };
    window.addEventListener('popstate', callback);
    return () => window.removeEventListener('popstate', callback);
  }, [changeLocation, prefetchLocation]);

  const children = componentIds.reduceRight(
    (acc: ReactNode, id) => createElement(Slot, { id }, acc),
    null,
  );

  return createElement(
    Fragment,
    null,
    createElement(Slot, { id: SHOULD_SKIP_ID }),
    createElement(
      RouterContext.Provider,
      { value: { loc, changeLocation, prefetchLocation } },
      children,
    ),
  );
}

export function Router({ basePath = '/RSC/' }: { basePath?: string }) {
  const loc = parseLocation();
  const initialInput = getInputString(loc.path, loc.searchParams);
  return createElement(
    Root as FunctionComponent<Omit<ComponentProps<typeof Root>, 'children'>>,
    { initialInput, basePath },
    createElement(InnerRouter, { basePath }),
  );
}
