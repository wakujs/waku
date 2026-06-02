import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  PREFETCH_LIMIT,
  PREFETCH_TTL,
  addPrefetchEntry,
  consumePrefetchEntry,
  hasPrefetchEntry,
} from '../src/lib/utils/prefetch-cache.js';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as any).__WAKU_PREFETCHED__;
});

describe('prefetch cache', () => {
  test('consume returns the stored elements once', () => {
    const elements = Promise.resolve({});
    addPrefetchEntry('R/a.txt', undefined, elements);

    expect(hasPrefetchEntry('R/a.txt', undefined)).toBe(true);
    expect(consumePrefetchEntry('R/a.txt', undefined)?.elements).toBe(elements);
    // A consumed entry is removed.
    expect(hasPrefetchEntry('R/a.txt', undefined)).toBe(false);
    expect(consumePrefetchEntry('R/a.txt', undefined)).toBeUndefined();
  });

  test('matches rscParams by reference', () => {
    const params = { q: 1 };
    addPrefetchEntry('R/a.txt', params, Promise.resolve({}));

    expect(hasPrefetchEntry('R/a.txt', { q: 1 })).toBe(false);
    expect(hasPrefetchEntry('R/a.txt', params)).toBe(true);
  });

  test('entries expire after the ttl', () => {
    addPrefetchEntry('R/a.txt', undefined, Promise.resolve({}));

    vi.setSystemTime(PREFETCH_TTL);
    expect(hasPrefetchEntry('R/a.txt', undefined)).toBe(false);
    expect(consumePrefetchEntry('R/a.txt', undefined)).toBeUndefined();
  });

  test('stays usable just before the ttl', () => {
    addPrefetchEntry('R/a.txt', undefined, Promise.resolve({}));

    vi.setSystemTime(PREFETCH_TTL - 1);
    expect(hasPrefetchEntry('R/a.txt', undefined)).toBe(true);
  });

  test('drops the oldest entries beyond the limit', () => {
    const paths = Array.from(
      { length: PREFETCH_LIMIT + 1 },
      (_, i) => `R/${i}.txt`,
    );
    for (const path of paths) {
      addPrefetchEntry(path, undefined, Promise.resolve({}));
    }

    const cache = (globalThis as any).__WAKU_PREFETCHED__ as unknown[];
    expect(cache).toHaveLength(PREFETCH_LIMIT);
    // The first inserted entry was evicted; the rest remain.
    expect(hasPrefetchEntry(paths[0]!, undefined)).toBe(false);
    expect(hasPrefetchEntry(paths[1]!, undefined)).toBe(true);
    expect(hasPrefetchEntry(paths[PREFETCH_LIMIT]!, undefined)).toBe(true);
  });
});
