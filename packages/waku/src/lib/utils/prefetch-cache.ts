// Client-side cache of prefetched navigations. Each entry holds the decoded
// `elements` promise, so a prefetch warms the render and a later navigation
// reuses it without re-fetching or re-decoding. The cache is bounded by both a
// time-to-live and a maximum size to keep memory usage in check.

/** How long (ms) a prefetched entry stays usable before it is discarded. */
export const PREFETCH_TTL = 1000 * 60;

/** Maximum number of prefetched entries kept at once. */
export const PREFETCH_LIMIT = 100;

type PrefetchEntry = {
  rscPath: string;
  rscParams: unknown;
  elements: unknown;
  expireAt: number;
};

const getCache = (): PrefetchEntry[] =>
  ((globalThis as any).__WAKU_PREFETCHED__ ||= []);

const findFreshIndex = (
  cache: PrefetchEntry[],
  rscPath: string,
  rscParams: unknown,
  now: number,
) =>
  cache.findIndex(
    (entry) =>
      entry.expireAt > now &&
      entry.rscPath === rscPath &&
      // rscParams is intentionally compared by reference.
      entry.rscParams === rscParams,
  );

export const addPrefetchEntry = (
  rscPath: string,
  rscParams: unknown,
  elements: unknown,
): void => {
  const cache = getCache();
  const now = Date.now();
  cache.push({ rscPath, rscParams, elements, expireAt: now + PREFETCH_TTL });
  while (
    cache.length > 0 &&
    (cache.length > PREFETCH_LIMIT || cache[0]!.expireAt <= now)
  ) {
    cache.shift();
  }
};

export const hasPrefetchEntry = (
  rscPath: string,
  rscParams: unknown,
): boolean => {
  const cache = getCache();
  return findFreshIndex(cache, rscPath, rscParams, Date.now()) >= 0;
};

export const consumePrefetchEntry = (
  rscPath: string,
  rscParams: unknown,
): PrefetchEntry | undefined => {
  const cache = getCache();
  const index = findFreshIndex(cache, rscPath, rscParams, Date.now());
  return index >= 0 ? cache.splice(index, 1)[0] : undefined;
};
