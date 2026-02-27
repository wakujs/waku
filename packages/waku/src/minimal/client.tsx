'use client';

import {
  createContext,
  memo,
  startTransition,
  use,
  useCallback,
  useEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import RSDWClient from 'react-server-dom-webpack/client';
import { createCustomError } from '../lib/utils/custom-errors.js';
import { encodeFuncId, encodeRscPath } from '../lib/utils/rsc-path.js';

const { createFromFetch, encodeReply, createTemporaryReferenceSet } =
  RSDWClient;

const DEFAULT_HTML_HEAD = [
  <meta charSet="utf-8" key="charset" />,
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
    key="viewport"
  />,
  <meta name="generator" content="Waku" key="generator" />,
];

const BASE_RSC_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE
}/`;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  const response = await responsePromise;
  if (!response.ok) {
    const location = response.headers.get('location');
    const err = createCustomError(
      (await response.text()) || response.statusText,
      {
        status: response.status,
        ...(location && { location }),
      },
    );
    throw err;
  }
  return response;
};

type Elements = Record<string, unknown>;

// TODO(daishi) do we still this?
const getCached = <T,>(c: () => T, m: WeakMap<object, T>, k: object): T =>
  (m.has(k) ? m : m.set(k, c())).get(k) as T;

const cache1 = new WeakMap();
const mergeElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements> | Elements,
): Promise<Elements> => {
  const getResult = () =>
    Promise.all([a, b]).then(([a, b]) => {
      const nextElements = { ...a, ...b };
      delete nextElements._value;
      return nextElements;
    });
  const cache2 = getCached(() => new WeakMap(), cache1, a);
  return getCached(getResult, cache2, b);
};

type SetElements = (
  updater: (prev: Promise<Elements>) => Promise<Elements>,
) => void;

const ENTRY = 'e';
const SET_ELEMENTS = 's';
const FETCH_FN = 'f';
const ON_CALL_SERVER_ELEMENTS = 'o';
const TRANSFORM_FETCH_RSC_INPUT = 't';

type OnCallServerElements = (elements: Elements) => void;
type TransformFetchRscInput = (
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => [rscPath: string, rscParams: unknown, prefetchOnly: boolean];

type FetchRscInternal = {
  (
    fetchCache: FetchCache,
    rscPath: string,
    rscParams: unknown,
    prefetchOnly: false,
  ): Promise<Elements>;
  (
    fetchCache: FetchCache,
    rscPath: string,
    rscParams: unknown,
    prefetchOnly: true,
  ): void;
};

type FetchCache = {
  [ENTRY]?: [
    rscPath: string,
    rscParams: unknown,
    elementsPromise: Promise<Elements>,
  ];
  [SET_ELEMENTS]?: SetElements;
  [FETCH_FN]?: typeof fetch;
  [ON_CALL_SERVER_ELEMENTS]?: OnCallServerElements;
  [TRANSFORM_FETCH_RSC_INPUT]?: TransformFetchRscInput;
};

const defaultFetchCache: FetchCache = {};

// TODO: This does't feel like an ideal solution.
type PrefetchedEntry =
  | Promise<Response> // from html
  | [
      responsePromise: Promise<Response>,
      rscParams?: unknown,
      temporaryReferences?: ReturnType<typeof createTemporaryReferenceSet>,
    ]; // from prefetch

const fetchRscInternal: FetchRscInternal = (
  fetchCache: FetchCache,
  rscPath: string,
  rscParams: unknown,
  prefetchOnly: boolean,
) => {
  const transformFetchRscInput = fetchCache[TRANSFORM_FETCH_RSC_INPUT];
  if (transformFetchRscInput) {
    [rscPath, rscParams, prefetchOnly] = transformFetchRscInput(
      rscPath,
      rscParams,
      prefetchOnly,
    );
  }
  const fetchFn = fetchCache[FETCH_FN] || fetch;
  const prefetched: Record<string, PrefetchedEntry> = ((
    globalThis as any
  ).__WAKU_PREFETCHED__ ||= {});
  let prefetchedEntry = prefetchOnly ? undefined : prefetched[rscPath];
  delete prefetched[rscPath];
  if (prefetchedEntry) {
    if (Array.isArray(prefetchedEntry)) {
      if (prefetchedEntry[1] !== rscParams) {
        prefetchedEntry = undefined;
      }
    } else {
      // We don't check rscParams for the initial hydration
      // It's limited and may result in a wrong result. FIXME
      prefetchedEntry = [prefetchedEntry];
    }
  }
  const temporaryReferences =
    prefetchedEntry?.[2] || createTemporaryReferenceSet();
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  const responsePromise = prefetchedEntry
    ? prefetchedEntry[0]
    : rscParams === undefined
      ? fetchFn(url)
      : rscParams instanceof URLSearchParams
        ? fetchFn(url + '?' + rscParams)
        : encodeReply(rscParams, { temporaryReferences }).then((body) =>
            fetchFn(url, { method: 'POST', body }),
          );
  if (prefetchOnly) {
    prefetched[rscPath] = [responsePromise, rscParams, temporaryReferences];
    return undefined as never;
  }
  return createFromFetch<Elements>(checkStatus(responsePromise), {
    callServer: (funcId: string, args: unknown[]) =>
      unstable_callServerRsc(funcId, args, () => fetchCache),
    temporaryReferences,
  });
};

/**
 * callServer callback
 * This is not a public API.
 */
export const unstable_callServerRsc = async (
  funcId: string,
  args: unknown[],
  enhanceFetchCache: (c: FetchCache) => FetchCache = (c) => c,
) => {
  const fetchCache = enhanceFetchCache(defaultFetchCache);
  const setElements = fetchCache[SET_ELEMENTS]!;
  const onCallServerElements = fetchCache[ON_CALL_SERVER_ELEMENTS];
  const rscPath = encodeFuncId(funcId);
  const rscParams =
    args.length === 1 && args[0] instanceof URLSearchParams ? args[0] : args;
  const { _value: value, ...data } = await fetchRscInternal(
    fetchCache,
    rscPath,
    rscParams,
    false,
  );
  if (Object.keys(data).length) {
    startTransition(() => {
      onCallServerElements?.(data);
      setElements((prev) => mergeElementsPromise(prev, data));
    });
  }
  return value;
};

export const unstable_fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  enhanceFetchCache: (c: FetchCache) => FetchCache = (c) => c,
): Promise<Elements> => {
  const fetchCache = enhanceFetchCache(defaultFetchCache);
  if (import.meta.hot) {
    const refetchRsc = () => {
      delete fetchCache[ENTRY];
      const data = unstable_fetchRsc(rscPath, rscParams, enhanceFetchCache);
      fetchCache[SET_ELEMENTS]!(() => data);
    };
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
    const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(
      globalThis.__WAKU_REFETCH_RSC__!,
    );
    if (index !== -1) {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRsc);
    } else {
      globalThis.__WAKU_RSC_RELOAD_LISTENERS__.push(refetchRsc);
    }
    globalThis.__WAKU_REFETCH_RSC__ = refetchRsc;
  }

  const entry = fetchCache[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const data = fetchRscInternal(fetchCache, rscPath, rscParams, false);
  fetchCache[ENTRY] = [rscPath, rscParams, data];
  return data;
};

export const unstable_prefetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  enhanceFetchCache: (c: FetchCache) => FetchCache = (c) => c,
): void => {
  const fetchCache = enhanceFetchCache(defaultFetchCache);
  const prefetched: Record<string, PrefetchedEntry> = ((
    globalThis as any
  ).__WAKU_PREFETCHED__ ||= {});
  const prefetchedEntry = prefetched[rscPath];
  if (Array.isArray(prefetchedEntry) && prefetchedEntry[1] === rscParams) {
    return; // already prefetched
  }
  fetchRscInternal(fetchCache, rscPath, rscParams, true);
};

export const unstable_enhanceFetchFn =
  (enhance: (fn: typeof fetch) => typeof fetch) =>
  (fetchCache: FetchCache): FetchCache => ({
    ...fetchCache,
    [FETCH_FN]: enhance(fetchCache[FETCH_FN] || fetch),
  });

export const unstable_enhanceFetchRscInput =
  (transform: TransformFetchRscInput) =>
  (fetchCache: FetchCache): FetchCache => {
    const previousTransform = fetchCache[TRANSFORM_FETCH_RSC_INPUT];
    return {
      ...fetchCache,
      [TRANSFORM_FETCH_RSC_INPUT]: previousTransform
        ? (rscPath, rscParams, prefetchOnly) =>
            transform(...previousTransform(rscPath, rscParams, prefetchOnly))
        : transform,
    };
  };

const RefetchContext = createContext<
  (
    rscPath: string,
    rscParams?: unknown,
    enhanceFetchCache?: (c: FetchCache) => FetchCache,
  ) => Promise<Elements>
>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Promise<Elements> | null>(null);
const FetchCacheContext = createContext<FetchCache | null>(null);

export const useFetchCache_UNSTABLE = () => {
  const fetchCache = use(FetchCacheContext);
  if (!fetchCache) {
    throw new Error('Missing Root component');
  }
  return fetchCache;
};

export const Root = ({
  initialRscPath,
  initialRscParams,
  fetchCache = defaultFetchCache,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  fetchCache?: FetchCache | undefined;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    unstable_fetchRsc(initialRscPath || '', initialRscParams, () => fetchCache),
  );
  useEffect(() => {
    fetchCache[SET_ELEMENTS] = setElements;
  }, [fetchCache]);
  const refetch = useCallback(
    async (
      rscPath: string,
      rscParams?: unknown,
      enhanceFetchCache: (c: FetchCache) => FetchCache = (c) => c,
    ) => {
      // clear cache entry before fetching
      delete fetchCache[ENTRY];
      const data = unstable_fetchRsc(rscPath, rscParams, () =>
        enhanceFetchCache(fetchCache),
      );
      const dataWithoutErrors = Promise.resolve(data).catch(() => ({}));
      setElements((prev) => mergeElementsPromise(prev, dataWithoutErrors));
      return data;
    },
    [fetchCache],
  );
  return (
    <FetchCacheContext value={fetchCache}>
      <RefetchContext value={refetch}>
        <ElementsContext value={elements}>
          {DEFAULT_HTML_HEAD}
          {children}
        </ElementsContext>
      </RefetchContext>
    </FetchCacheContext>
  );
};

export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext);

export const Children = () => use(ChildrenContext);

export const useElementsPromise_UNSTABLE = () => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  return elementsPromise;
};

/**
 * Slot component
 * This is used under the Root component.
 * Slot id is the key of elements returned by the server.
 *
 * If the server returns this
 * ```
 *   { 'foo': <div>foo</div>, 'bar': <div>bar</div> }
 * ```
 * then you can use this component like this
 * ```
 *   <Root><Slot id="foo" /><Slot id="bar" /></Root>
 * ```
 */
export const Slot = ({
  id,
  children,
}: {
  id: string;
  children?: ReactNode;
}) => {
  const elementsPromise = useElementsPromise_UNSTABLE();
  const elements = use(elementsPromise);
  if (id in elements && elements[id] === undefined) {
    throw new Error('Element cannot be undefined, use null instead: ' + id);
  }
  const element = elements[id];
  const isValidElement = element !== undefined;
  if (!isValidElement) {
    throw new Error('Invalid element: ' + id);
  }
  return (
    <ChildrenContextProvider value={children}>
      {element as ReactNode}
    </ChildrenContextProvider>
  );
};

/**
 * ServerRoot for SSR
 * This is not a public API.
 */
export const INTERNAL_ServerRoot = ({
  elementsPromise,
  children,
}: {
  elementsPromise: Promise<Elements>;
  children: ReactNode;
}) => (
  <ElementsContext value={elementsPromise}>
    {DEFAULT_HTML_HEAD}
    {children}
  </ElementsContext>
);
