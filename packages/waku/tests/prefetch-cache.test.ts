import { describe, expect, it } from 'vitest';
import {
  PREFETCH_LIMIT,
  PREFETCH_TTL,
  getPrefetch,
  mergePrefetchedElements,
  prefetchCacheKey,
  releasePrefetchedElements,
  reservePrefetchedElements,
  setPrefetch,
} from '../src/router/prefetch-cache.js';
import type {
  PrefetchCache,
  PrefetchEntry,
  PrefetchedElementsStore,
} from '../src/router/prefetch-cache.js';

const entry = (expireAt: number): PrefetchEntry => ({
  promise: Promise.resolve({}),
  expireAt,
});

describe('router prefetch cache', () => {
  it('keys distinctly by path and query', () => {
    expect(prefetchCacheKey('/x', 'a=1')).toBe(prefetchCacheKey('/x', 'a=1'));
    expect(prefetchCacheKey('/x', 'a=1')).not.toBe(
      prefetchCacheKey('/x', 'a=2'),
    );
    expect(prefetchCacheKey('/x', '')).not.toBe(prefetchCacheKey('/y', ''));
  });

  it('returns a fresh entry and evicts an expired one on read', () => {
    const cache: PrefetchCache = new Map();
    const key = prefetchCacheKey('/x', '');
    setPrefetch(cache, key, entry(1000));
    expect(getPrefetch(cache, key, 999)).toBeDefined();
    expect(getPrefetch(cache, key, 1000)).toBeUndefined();
    expect(cache.has(key)).toBe(false);
  });

  it('bounds the cache at PREFETCH_LIMIT, evicting the oldest first', () => {
    const cache: PrefetchCache = new Map();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      setPrefetch(cache, prefetchCacheKey('/p', String(i)), entry(Infinity));
    }
    expect(cache.size).toBe(PREFETCH_LIMIT);
    expect(cache.has(prefetchCacheKey('/p', '0'))).toBe(false);
    expect(cache.has(prefetchCacheKey('/p', '4'))).toBe(false);
    expect(cache.has(prefetchCacheKey('/p', '5'))).toBe(true);
    expect(cache.has(prefetchCacheKey('/p', String(PREFETCH_LIMIT + 4)))).toBe(
      true,
    );
  });

  it('has a positive ttl', () => {
    expect(PREFETCH_TTL).toBeGreaterThan(0);
  });

  it('merges responses for the same rscPath in the store', () => {
    const store: PrefetchedElementsStore = new Map();
    mergePrefetchedElements(store, '/p', { a: 1 });
    mergePrefetchedElements(store, '/p', { b: 2 });
    expect(store.get('/p')).toEqual({ a: 1, b: 2 });
  });

  it('bounds the store at PREFETCH_LIMIT, evicting the oldest first', () => {
    const store: PrefetchedElementsStore = new Map();
    for (let i = 0; i < PREFETCH_LIMIT + 5; i += 1) {
      // the flow the router follows: reserve at fetch start, merge on
      // resolution
      reservePrefetchedElements(store, `/p${i}`);
      mergePrefetchedElements(store, `/p${i}`, { i });
    }
    expect(store.size).toBe(PREFETCH_LIMIT);
    expect(store.has('/p0')).toBe(false);
    expect(store.has('/p4')).toBe(false);
    expect(store.has('/p5')).toBe(true);
    expect(store.has(`/p${PREFETCH_LIMIT + 4}`)).toBe(true);
    // merging into an existing entry does not evict
    mergePrefetchedElements(store, '/p5', { j: 1 });
    expect(store.size).toBe(PREFETCH_LIMIT);
    expect(store.has('/p5')).toBe(true);
  });

  it('replaces a reservation with the resolved response', () => {
    const store: PrefetchedElementsStore = new Map();
    reservePrefetchedElements(store, '/p');
    expect(store.get('/p')).toBe(null);
    reservePrefetchedElements(store, '/p');
    expect(store.size).toBe(1);
    mergePrefetchedElements(store, '/p', { a: 1 });
    expect(store.get('/p')).toEqual({ a: 1 });
  });

  it('releases only an unfulfilled reservation', () => {
    const store: PrefetchedElementsStore = new Map();
    reservePrefetchedElements(store, '/p');
    releasePrefetchedElements(store, '/p');
    expect(store.has('/p')).toBe(false);
    reservePrefetchedElements(store, '/p');
    mergePrefetchedElements(store, '/p', { a: 1 });
    releasePrefetchedElements(store, '/p');
    expect(store.get('/p')).toEqual({ a: 1 });
  });
});
