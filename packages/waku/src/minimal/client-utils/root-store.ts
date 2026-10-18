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

export type RequestRscEnhancer = (requestRsc: RequestRsc) => RequestRsc;

export type FetchRscOptions = {
  signal?: AbortSignal;
  onBuildIdMismatch?: () => void;
  /**
   * Retained elements whose etags are sent, allowing the server to omit them.
   * The response is combined over this base unless `merge` is supplied.
   */
  unstable_base?: Elements;
  /**
   * Defaults to `unstable_combineElements`; runs when `unstable_base` is supplied.
   * Return `response` to receive only returned entries while sending base etags.
   */
  merge?: (base: Elements, response: Elements) => Elements;
};

export type FetchRsc = (
  rscPath: string,
  rscParams?: unknown,
  options?: FetchRscOptions,
) => Promise<Elements>;

export type RootStore = {
  setElements: SetElements;
  etags: Etags;
  enhancers: [enhance: RequestRscEnhancer, order: number][];
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
