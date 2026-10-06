import { afterEach, describe, expect, it } from 'vitest';
import { CREATE_PAGES_CONFIGS_KEY } from '../src/router/create-pages-utils/config.js';
import {
  getRouterPrefetchCode,
  setupRouterSearchCodecs,
} from '../src/router/define-router-utils/client-code.js';
import type { Unstable_SearchCodec } from '../src/router/isomorphic-utils/search-codec-registry.js';

type Globals = {
  __WAKU_ROUTER_PREFETCH__?: (path: string, cb: (id: string) => void) => void;
  __WAKU_ROUTER_SEARCH_CODECS__?: Record<string, string>;
};
const globals = globalThis as Globals;

const codec = (id: string): Unstable_SearchCodec<any> => ({
  id,
  parse: () => ({}),
  serialize: () => '',
});

// The generated prefetch code assigns globalThis.__WAKU_ROUTER_PREFETCH__.
const runPrefetch = (code: string) => {
  new Function(code)();
  const fn = globals.__WAKU_ROUTER_PREFETCH__!;
  return (path: string) => {
    const ids: string[] = [];
    fn(path, (id) => ids.push(id));
    return ids;
  };
};

afterEach(() => {
  delete globals.__WAKU_ROUTER_PREFETCH__;
  delete globals.__WAKU_ROUTER_SEARCH_CODECS__;
});

describe('getRouterPrefetchCode', () => {
  it('deduplicates module ids while preserving per-route mappings', () => {
    const code = getRouterPrefetchCode({
      '/a': ['m1', 'm2'],
      '/b': ['m2', 'm3'],
    });
    // ids are deduped to a single shared list
    expect(code).toContain('["m1","m2","m3"]');
    const prefetch = runPrefetch(code);
    expect(prefetch('/a')).toEqual(['m1', 'm2']);
    expect(prefetch('/b')).toEqual(['m2', 'm3']);
  });

  it('emits no ids for a path with no matching pattern', () => {
    const prefetch = runPrefetch(getRouterPrefetchCode({ '/a': ['m1'] }));
    expect(prefetch('/no-match')).toEqual([]);
  });
});

describe('setupRouterSearchCodecs', () => {
  it('keeps the registered route patterns as keys', () => {
    setupRouterSearchCodecs({ '/ap': codec('ca'), '/b': codec('cb') });
    const map = globals.__WAKU_ROUTER_SEARCH_CODECS__!;
    expect(map['/ap']).toBe('ca');
    expect(map['/b']).toBe('cb');
  });

  it('emits no script when no route has a search codec', () => {
    expect(setupRouterSearchCodecs({})).toBe('');
    expect(globals.__WAKU_ROUTER_SEARCH_CODECS__).toBeUndefined();
  });

  it('escapes `<` in the inline JSON', () => {
    const script = setupRouterSearchCodecs({ '/foo': codec('c<x') });
    expect(script).toContain('\\u003c');
    expect(script).not.toContain('<');
  });
});

describe('CREATE_PAGES_CONFIGS_KEY', () => {
  it('matches the persisted metadata key exactly', () => {
    expect(CREATE_PAGES_CONFIGS_KEY).toBe('defineRouter:serializableConfigs');
  });
});
