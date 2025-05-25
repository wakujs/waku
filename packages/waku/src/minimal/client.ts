'use client';

import {
  createContext,
  createElement,
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
import { encodeRscPath, encodeFuncId } from '../lib/renderers/utils.js';

const { createFromFetch, encodeReply, createTemporaryReferenceSet } =
  RSDWClient;

declare global {
  interface ImportMeta {
    readonly env: Record<string, string>;
  }
}

const DEFAULT_HTML_HEAD = [
  createElement('meta', { charSet: 'utf-8' }),
  createElement('meta', {
    name: 'viewport',
    content: 'width=device-width, initial-scale=1',
  }),
  createElement('meta', { name: 'generator', content: 'Waku' }),
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

const getCached = <T>(c: () => T, m: WeakMap<object, T>, k: object): T =>
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

type FetchCache = {
  [ENTRY]?: [
    rscPath: string,
    rscParams: unknown,
    elementsPromise: Promise<Elements>,
  ];
  [SET_ELEMENTS]?: SetElements;
};

const defaultFetchCache: FetchCache = {};

const prefetchedParams = new WeakMap<Promise<unknown>, unknown>();
const prefetchedTemporaryReferences = new WeakMap<
  Promise<unknown>,
  ReturnType<typeof createTemporaryReferenceSet>
>();

const fetchRscInternal = (
  rscPath: string,
  rscParams: unknown,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
) => {
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  return rscParams === undefined
    ? fetch(url)
    : rscParams instanceof URLSearchParams
      ? fetch(url + '?' + rscParams)
      : encodeReply(rscParams, { temporaryReferences }).then((body) =>
          fetch(url, { method: 'POST', body }),
        );
};

/**
 * callServer callback
 * This is not a public API.
 */
export const unstable_callServerRsc = async (
  funcId: string,
  args: unknown[],
  fetchCache = defaultFetchCache,
) => {
  const temporaryReferences = createTemporaryReferenceSet();
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        unstable_callServerRsc(funcId, args, fetchCache),
      temporaryReferences,
    });
  const rscPath = encodeFuncId(funcId);
  const rscParams =
    args.length === 1 && args[0] instanceof URLSearchParams ? args[0] : args;
  const responsePromise = fetchRscInternal(
    rscPath,
    rscParams,
    temporaryReferences,
  );
  const { _value: value, ...data } = await createData(responsePromise);
  if (Object.keys(data).length) {
    startTransition(() => {
      fetchCache[SET_ELEMENTS]?.((prev) => mergeElementsPromise(prev, data));
    });
  }
  return value;
};

export const fetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  fetchCache = defaultFetchCache,
): Promise<Elements> => {
  const entry = fetchCache[ENTRY];
  if (entry && entry[0] === rscPath && entry[1] === rscParams) {
    return entry[2];
  }
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  const hasValidPrefetchedResponse =
    !!prefetched[rscPath] &&
    // HACK .has() is for the initial hydration
    // It's limited and may result in a wrong result. FIXME
    (!prefetchedParams.has(prefetched[rscPath]) ||
      prefetchedParams.get(prefetched[rscPath]) === rscParams);
  const temporaryReferences =
    prefetchedTemporaryReferences.get(prefetched[rscPath]) ||
    createTemporaryReferenceSet();
  const createData = (responsePromise: Promise<Response>) =>
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (funcId: string, args: unknown[]) =>
        unstable_callServerRsc(funcId, args, fetchCache),
      temporaryReferences,
    });
  const responsePromise = hasValidPrefetchedResponse
    ? prefetched[rscPath]
    : fetchRscInternal(rscPath, rscParams, temporaryReferences);
  delete prefetched[rscPath];
  const data = createData(responsePromise);
  fetchCache[ENTRY] = [rscPath, rscParams, data];
  return data;
};

export const prefetchRsc = (rscPath: string, rscParams?: unknown): void => {
  const prefetched = ((globalThis as any).__WAKU_PREFETCHED__ ||= {});
  if (!(rscPath in prefetched)) {
    const temporaryReferences = createTemporaryReferenceSet();
    prefetched[rscPath] = fetchRscInternal(
      rscPath,
      rscParams,
      temporaryReferences,
    );
    prefetchedParams.set(prefetched[rscPath], rscParams);
    prefetchedTemporaryReferences.set(prefetched[rscPath], temporaryReferences);
  }
};

const RefetchContext = createContext<
  (rscPath: string, rscParams?: unknown) => Promise<void>
>(() => {
  throw new Error('Missing Root component');
});
const ElementsContext = createContext<Promise<Elements> | null>(null);

export const Root = ({
  initialRscPath,
  initialRscParams,
  fetchCache = defaultFetchCache,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  fetchCache?: FetchCache;
  children: ReactNode;
}) => {
  const [elements, setElements] = useState(() =>
    fetchRsc(initialRscPath || '', initialRscParams, fetchCache),
  );
  useEffect(() => {
    fetchCache[SET_ELEMENTS] = setElements;
  }, [fetchCache]);
  const refetch = useCallback(
    async (rscPath: string, rscParams?: unknown) => {
      // clear cache entry before fetching
      delete fetchCache[ENTRY];
      const data = fetchRsc(rscPath, rscParams, fetchCache);
      const dataWithoutErrors = Promise.resolve(data).catch(() => ({}));
      setElements((prev) => mergeElementsPromise(prev, dataWithoutErrors));
      await data;
    },
    [fetchCache],
  );
  return createElement(
    RefetchContext.Provider,
    { value: refetch },
    createElement(
      ElementsContext.Provider,
      { value: elements },
      ...DEFAULT_HTML_HEAD,
      children,
    ),
  );
};

export const useRefetch = () => use(RefetchContext);

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext.Provider);

export const Children = () => use(ChildrenContext);

export const useElement = (id: string) => {
  const elementsPromise = use(ElementsContext);
  if (!elementsPromise) {
    throw new Error('Missing Root component');
  }
  const elements = use(elementsPromise);
  if (id in elements && elements[id] == undefined) {
    throw new Error('Element cannot be undefined, use null instead: ' + id);
  }
  return elements[id];
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
  unstable_fallback,
}: {
  id: string;
  children?: ReactNode;
  unstable_fallback?: ReactNode;
}) => {
  const element = useElement(id);
  const isValidElement = element !== undefined;
  if (!isValidElement) {
    if (unstable_fallback) {
      return unstable_fallback;
    }
    throw new Error('Invalid element: ' + id);
  }
  return createElement(
    ChildrenContextProvider,
    { value: children },
    // FIXME is there `isReactNode` type checker?
    element as ReactNode,
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
}) =>
  createElement(
    ElementsContext.Provider,
    { value: elementsPromise },
    ...DEFAULT_HTML_HEAD,
    children,
  );
