// Router-scoped cache of prefetched route trees. Keyed by (rscPath, query) so a
// prefetch for one query is never reused for another, and bounded by a ttl and a
// size limit so hover-prefetching in a long session cannot grow without bound.

type Elements = Record<string, unknown>;

export type PrefetchMode = 'always' | 'once';

export type PrefetchOptions = {
  mode?: PrefetchMode;
  ttl?: number;
};

export type PrefetchEntry = {
  promise: Promise<Elements>;
  expireAt: number;
};

export type PrefetchCache = Map<string, PrefetchEntry>;

// Session store of prefetched responses, keyed by rscPath alone. Entries are
// only served under the etag protocol: they paint immutable slots (which
// cannot vary by query) and fall back for a dynamic slot only when the
// server omits it, which proves the stored copy current. A null entry marks
// a route whose first prefetch is still in flight.
export type PrefetchedElementsStore = Map<string, Elements | null>;

export const PREFETCH_TTL = 1000 * 60;
export const PREFETCH_LIMIT = 100;

export const prefetchCacheKey = (rscPath: string, query: string): string =>
  rscPath + '\0' + query;

/** Return a still-fresh entry for the key, evicting it if it has expired. */
export const getPrefetch = (
  cache: PrefetchCache,
  key: string,
  now: number,
): PrefetchEntry | undefined => {
  const entry = cache.get(key);
  if (entry && entry.expireAt <= now) {
    cache.delete(key);
    return undefined;
  }
  return entry;
};

/** Insert an entry, evicting the oldest ones once the size limit is reached. */
export const setPrefetch = (
  cache: PrefetchCache,
  key: string,
  entry: PrefetchEntry,
): void => {
  while (cache.size >= PREFETCH_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
  cache.set(key, entry);
};

/** Merge a prefetched response into the session store. */
export const mergePrefetchedElements = (
  store: PrefetchedElementsStore,
  rscPath: string,
  elements: Elements,
): void => {
  if (!store.has(rscPath) && store.size >= PREFETCH_LIMIT) {
    const oldestKey = store.keys().next().value;
    if (oldestKey !== undefined) {
      store.delete(oldestKey);
    }
  }
  const existing = store.get(rscPath);
  store.set(rscPath, existing ? { ...existing, ...elements } : elements);
};
