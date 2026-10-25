import type { Etags } from '../../lib/utils-isomorphic/etags.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export type SetElements = (
  updater: (prev: Promise<Elements>) => Promise<Elements>,
) => void;

export type RequestRsc = (
  rscPath: string,
  rscParams: unknown,
  options: {
    type: 'rsc' | 'call';
    fetch: typeof fetch;
    signal?: AbortSignal;
  },
) => Promise<{ elements: Elements; value?: unknown }>;

/**
 * Wraps Root request inputs, the supplied fetch, or decoded elements and values.
 * `options.type` distinguishes RSC fetches from server function calls. Forward the
 * supplied fetch and signal when composing transport. Return the server function value
 * alongside elements; use `unstable_combineElements` to preserve their etags.
 * In an enhancer array, the last entry wraps all earlier entries.
 */
export type RscEnhancer = (requestRsc: RequestRsc) => RequestRsc;

export type FetchRscOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  /**
   * Retained elements whose etags are sent, allowing the server to omit them.
   * The returned response does not include omitted entries from this base.
   */
  unstable_base?: Elements;
};

export type FetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  options?: FetchRscOptions,
) => Promise<Elements>;

export type RootStore = {
  setElements: SetElements;
  etags: Etags;
  rscEnhancers: readonly RscEnhancer[];
  fetchRsc: FetchRsc;
};

const mountedRootStores: RootStore[] = [];

export const getDefaultRootStore = (): RootStore | undefined =>
  mountedRootStores.at(-1);

export const clearRootCachedEtags = (): void => {
  mountedRootStores.forEach((store) => {
    store.etags = {};
  });
};

export const registerRootStore = (store: RootStore) => {
  mountedRootStores.push(store);
  return () => {
    const index = mountedRootStores.lastIndexOf(store);
    if (index !== -1) {
      mountedRootStores.splice(index, 1);
    }
  };
};
