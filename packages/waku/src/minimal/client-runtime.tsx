'use client';

import {
  createContext,
  memo,
  startTransition,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import RSDWClient from 'react-server-dom-webpack/client';
import { consumeInitialRscEntry } from '../lib/utils-client/initial-rsc.js';
import { setupDebugChannel } from '../lib/utils-client/react-debug-channel.js';
import { createCustomError } from '../lib/utils-isomorphic/custom-errors.js';
import {
  ETAGS_HEADER,
  serializeClientEtags,
} from '../lib/utils-isomorphic/etags.js';
import type { Etags } from '../lib/utils-isomorphic/etags.js';
import {
  encodeRscPath,
  encodeServerFunctionId,
} from '../lib/utils-isomorphic/rsc-path.js';
import {
  adoptElements,
  collectEtags,
  combineElements,
  isImmutableElement,
} from './client-utils/element-etags.js';
import {
  getInitialRscEntry,
  releaseInitialRscEntry,
} from './client-utils/initial-rsc-store.js';
import {
  getDefaultRootStore,
  registerRootStore,
} from './client-utils/root-store.js';
import type {
  FetchRsc,
  FetchRscOptions,
  RequestRsc,
  RootStore,
  RscEnhancer,
} from './client-utils/root-store.js';
import {
  registerRootReload,
  registerRootRscReloadListener,
} from './client-utils/rsc-reload.js';
import type { RegisterRscReloadListener } from './client-utils/rsc-reload.js';

const { createFromFetch, encodeReply, createTemporaryReferenceSet } =
  RSDWClient;

export { formatRscUrl as unstable_formatRscUrl } from '../lib/utils-isomorphic/rsc-path.js';

const META_GENERATOR = <meta name="generator" content="Waku" />;

const BASE_RSC_PATH = `${import.meta.env?.WAKU_CONFIG_BASE_PATH ?? '/'}${
  import.meta.env?.WAKU_CONFIG_RSC_BASE ?? 'RSC'
}/`;

const checkStatus = async (
  responsePromise: Promise<Response>,
): Promise<Response> => {
  let response: Response;
  try {
    response = await responsePromise;
  } catch (e) {
    if (e instanceof TypeError) {
      // fetch reports a network error as a TypeError, so no response arrived
      throw createCustomError(e.message, { unstable_networkError: true });
    }
    throw e;
  }
  if (!response.ok) {
    throw createCustomError((await response.text()) || response.statusText, {
      status: response.status,
    });
  }
  return response;
};

// only the client adds symbol keys; a decoded server payload has string keys
type Elements = Readonly<Record<string | symbol, unknown>>;

export {
  combineElements as unstable_combineElements,
  isImmutableElement as unstable_isImmutableElement,
};

const mergeElementsPromise = (
  a: Promise<Elements>,
  b: Promise<Elements> | Elements,
): Promise<Elements> =>
  Promise.all([a, b]).then(([a, b]) => combineElements(a, b));

type FetchRscElementsOptions = {
  type?: 'rsc' | 'call';
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  etags?: Etags;
  initial?: NonNullable<ReturnType<typeof consumeInitialRscEntry>>;
};

const requestRsc = (
  fetchFn: typeof fetch,
  rscPath: string,
  rscParams: unknown,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
  signal: AbortSignal | undefined,
  etags?: Etags,
): Promise<Response> => {
  const url = BASE_RSC_PATH + encodeRscPath(rscPath);
  const init: RequestInit = {
    headers: {
      [ETAGS_HEADER]: serializeClientEtags(etags ?? {}),
    },
  };
  if (signal) {
    init.signal = signal;
  }
  if (rscParams === undefined) {
    return fetchFn(url, init);
  }
  if (rscParams instanceof URLSearchParams) {
    return fetchFn(url + '?' + rscParams, init);
  }
  return encodeReply(rscParams, { temporaryReferences }).then((body) =>
    fetchFn(url, { ...init, method: 'POST', body }),
  );
};

const decodeRsc = (
  responsePromise: Promise<Response>,
  temporaryReferences: ReturnType<typeof createTemporaryReferenceSet>,
  debugChannel:
    ReturnType<typeof setupDebugChannel>['debugChannel'] | undefined,
): Promise<Elements> =>
  Promise.resolve(
    createFromFetch<Elements>(checkStatus(responsePromise), {
      callServer: (serverFunctionId: string, args: unknown[]) =>
        unstable_callServerRsc(serverFunctionId, args),
      debugChannel,
      temporaryReferences,
    }),
  ).then((data) => {
    if (typeof data._location !== 'string') {
      return data;
    }
    // no fetch can follow this, so it fails here and the browser goes instead
    throw createCustomError('document navigation', {
      location: data._location,
      unstable_leave: true,
    });
  });

const reloadOnBuildIdMismatch = (
  elements: Promise<Elements>,
  onBuildIdMismatch: (() => void) | undefined,
) => {
  if (!import.meta.env?.WAKU_BUILD_ID) {
    return;
  }
  Promise.resolve(elements).then(
    (data) => {
      if (data._buildId !== import.meta.env.WAKU_BUILD_ID) {
        (onBuildIdMismatch ?? (() => window.location.reload()))();
      }
    },
    () => {},
  );
};

const EMPTY_RSC_ENHANCERS: readonly RscEnhancer[] = [];

const fetchRscElements = (
  rscPath: string,
  rscParams: unknown,
  options: FetchRscElementsOptions,
  rscEnhancers: readonly RscEnhancer[] = EMPTY_RSC_ENHANCERS,
): ReturnType<RequestRsc> => {
  let request: RequestRsc = (
    path,
    params,
    { type, fetch: transport, signal },
  ) => {
    const initial = options.initial;
    const debug = import.meta.hot
      ? setupDebugChannel(transport, !!initial, initial?.debugId)
      : undefined;
    const fetchFn = debug?.fetchFn || transport;
    const temporaryReferences = createTemporaryReferenceSet();
    const responsePromise = initial
      ? initial.response
      : requestRsc(
          fetchFn,
          path,
          params,
          temporaryReferences,
          signal,
          options.etags,
        );
    const elements = decodeRsc(
      responsePromise,
      temporaryReferences,
      debug?.debugChannel,
    );
    reloadOnBuildIdMismatch(elements, options.onBuildIdMismatch);
    return elements.then((data) =>
      type === 'call'
        ? { elements: adoptElements(data), value: data._value }
        : { elements: adoptElements(data) },
    );
  };
  try {
    for (const enhance of rscEnhancers) {
      request = enhance(request);
    }
    return request(rscPath, rscParams, {
      type: options.type ?? 'rsc',
      fetch: fetch.bind(globalThis),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (e) {
    return Promise.reject(e);
  }
};

export const unstable_callServerRsc = async (
  serverFunctionId: string,
  args: unknown[],
) => {
  const rootStore = getDefaultRootStore();
  const rscPath = encodeServerFunctionId(serverFunctionId);
  const rscParams =
    args.length === 1 && args[0] instanceof URLSearchParams ? args[0] : args;
  const { elements: data, value } = await fetchRscElements(
    rscPath,
    rscParams,
    { type: 'call', etags: rootStore?.etags ?? {} },
    rootStore?.rscEnhancers,
  );
  if (Reflect.ownKeys(data).length) {
    if (!rootStore) {
      throw new Error(
        'Server function returned elements without a mounted Root component. Call mount-time server functions from useEffect, not useLayoutEffect.',
      );
    }
    startTransition(() => {
      rootStore.setElements((prev) => mergeElementsPromise(prev, data));
    });
  }
  return value;
};

const noop = () => {};

const fetchRsc = (
  rscPath: string,
  rscParams: unknown,
  options: FetchRscOptions | undefined,
  store: RootStore | undefined,
): Promise<Elements> =>
  fetchRscElements(
    rscPath,
    rscParams,
    {
      etags: collectEtags(options?.unstable_base ?? {}),
      ...(options?.signal ? { signal: options.signal } : {}),
      ...(options?.onBuildIdMismatch
        ? { onBuildIdMismatch: options.onBuildIdMismatch }
        : {}),
    },
    store?.rscEnhancers,
  ).then(({ elements }) => elements);

const getInitialRsc = (
  rscPath: string,
  rscParams: unknown,
  rscEnhancers: readonly RscEnhancer[],
): Promise<Elements> =>
  getInitialRscEntry(
    rscPath,
    rscParams,
    () => {
      const initial = consumeInitialRscEntry();
      return fetchRscElements(
        rscPath,
        rscParams,
        initial ? { initial } : { etags: {} },
        initial ? EMPTY_RSC_ENHANCERS : rscEnhancers,
      ).then(({ elements }) => elements);
    },
    rscEnhancers,
  );

type MergeElements = (
  elements: Elements | Promise<Elements>,
  merge?: (
    previous: Promise<Elements>,
    incoming: Promise<Elements>,
  ) => Promise<Elements>,
) => Promise<Elements>;

const RootStoreContext = createContext<RootStore | null | undefined>(undefined);

const useRootStore = (): RootStore | null => {
  const store = use(RootStoreContext);
  if (store === undefined) {
    throw new Error('Missing Root component');
  }
  return store;
};

const fetchWithoutRoot: FetchRsc = (rscPath, rscParams, options) =>
  fetchRsc(rscPath, rscParams, options, undefined);

/**
 * Returns the fetch of the enclosing `Root_UNSTABLE`, which runs that Root's
 * enhancers and returns response entries without merging them into the Root or
 * `unstable_base`. Omitted slots must be retained by the caller. Outside a Root
 * it runs no enhancers.
 */
export const useFetchRsc_UNSTABLE = (): FetchRsc =>
  use(RootStoreContext)?.fetchRsc ?? fetchWithoutRoot;

const ElementsContext = createContext<Promise<Elements> | null>(null);

/**
 * Returns a function that merges an element record or its promise into the
 * enclosing Root. Returns the incoming payload without waiting for the merge
 * or render, or rejects on failure. A rejected ordinary merge leaves the
 * current elements unchanged.
 * A custom merge receives the latest queued element promise and the incoming
 * promise with rejected payloads recovered to an empty record. It returns the
 * replacement promise, or the previous promise to leave the Root unchanged.
 * The callback must be pure; results are memoized for React's updater replay.
 * Use `startTransition` to retain visible content while this or an earlier
 * queued update is pending; urgent merges can show a Suspense fallback.
 */
export const useMergeElements_UNSTABLE = () => {
  const store = useRootStore();
  return useCallback<MergeElements>(
    (data, merge = mergeElementsPromise) => {
      if (store === null) {
        return Promise.resolve({});
      }
      const elements = Promise.resolve(data);
      const recovered = elements.catch(() => ({}));
      store.setElements((prev) => merge(prev, recovered));
      return elements;
    },
    [store],
  );
};

/**
 * Returns a Root-bound registrar for development RSC reload listeners. The
 * registrar is a no-op in production. Listeners coexist by default. With
 * `replace`, the listener owns the Root's active refetch target until it is
 * replaced or unregistered.
 */
export const useRegisterRscReloadListener_UNSTABLE = () => {
  const store = useRootStore();
  return useCallback<RegisterRscReloadListener>(
    (listener, options) =>
      import.meta.hot && store !== null
        ? registerRootRscReloadListener(store, listener, options)
        : noop,
    [store],
  );
};

/**
 * Client root. Seeds the initial elements, bridges the store to React state,
 * and provides the elements to `Slot` descendants.
 */
export const Root_UNSTABLE = ({
  initialRscPath,
  initialRscParams,
  rscEnhancers = EMPTY_RSC_ENHANCERS,
  children,
}: {
  initialRscPath?: string;
  initialRscParams?: unknown;
  /**
   * Initial pipeline, copied for this mount; the last enhancer is outermost.
   * Keep the array reference stable across renders, including initial Suspense
   * retries. Remount with a new array to change the pipeline.
   * Client bootstrap fetches use it; streamed initial payloads bypass it.
   */
  rscEnhancers?: readonly RscEnhancer[];
  children: ReactNode;
}) => {
  const [initialInput] = useState(
    () => [initialRscPath || '', initialRscParams] as const,
  );
  const [initialElements] = useState(() =>
    getInitialRsc(...initialInput, rscEnhancers),
  );
  const [elements, setElements] = useState(initialElements);
  const [store] = useState(() => {
    const store: RootStore = {
      setElements: (update) => {
        const results = new WeakMap<Promise<Elements>, Promise<Elements>>();
        setElements((prev) => {
          let next = results.get(prev);
          if (!next) {
            next = update(prev);
            results.set(prev, next);
          }
          return next;
        });
      },
      etags: {},
      rscEnhancers: [...rscEnhancers],
      fetchRsc: (rscPath, rscParams, options) =>
        fetchRsc(rscPath, rscParams, options, store),
    };
    return store;
  });
  useLayoutEffect(() => {
    releaseInitialRscEntry(...initialInput, initialElements);
    const unregisterStore = registerRootStore(store);
    const unregisterReload = import.meta.hot
      ? registerRootReload(store, () => {
          const data = store.fetchRsc(...initialInput);
          store.setElements((prev) =>
            Promise.all([prev, data]).then(([prev, incoming]) =>
              combineElements(incoming, prev, {
                filter: (key) => typeof key === 'symbol' && !(key in incoming),
              }),
            ),
          );
        })
      : undefined;
    return () => {
      unregisterStore();
      unregisterReload?.();
    };
  }, [initialElements, initialInput, store]);
  useEffect(() => {
    elements.then(
      (resolved) => {
        store.etags = collectEtags(resolved);
      },
      () => {},
    );
  }, [elements, store]);
  return (
    <RootStoreContext value={store}>
      <ElementsContext value={elements}>
        {META_GENERATOR}
        {children}
      </ElementsContext>
    </RootStoreContext>
  );
};

const ChildrenContext = createContext<ReactNode>(undefined);
const ChildrenContextProvider = memo(ChildrenContext);

/** Render the client children passed to the enclosing Slot. */
export const Children_UNSTABLE = () => use(ChildrenContext);

/**
 * Returns the enclosing Root's read-only element-map promise. Reading it with
 * React's `use` suspends while the record is pending.
 */
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
export const Slot_UNSTABLE = ({
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

export const INTERNAL_ServerRoot = ({
  elementsPromise,
  children,
}: {
  elementsPromise: Promise<Elements>;
  children: ReactNode;
}) => (
  <RootStoreContext value={null}>
    <ElementsContext value={elementsPromise}>
      {META_GENERATOR}
      {children}
    </ElementsContext>
  </RootStoreContext>
);

export { getErrorInfo as unstable_getErrorInfo } from '../lib/utils-isomorphic/custom-errors.js';
