import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertNonReservedSlotId,
  getPathSpecCacheId,
} from '../src/router/create-pages-utils/element-ids.js';
import {
  createElementCache,
  getSlotCacheId,
} from '../src/router/define-router-utils/element-cache.js';
import type { PathSpec } from '../src/router/isomorphic-utils/path-spec.js';
import { serializeRsc } from '../src/server.js';

// Reversible stand-ins so a round-trip through the cache is observable.
vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn(async (bytes: Uint8Array) =>
    JSON.parse(new TextDecoder().decode(bytes)),
  ),
  serializeRsc: vi.fn(async (el: unknown) =>
    new TextEncoder().encode(JSON.stringify(el)),
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('element cache', () => {
  it('preload then get returns the deserialized value', async () => {
    const cache = createElementCache();
    cache.preload('slot/x', { data: btoa(JSON.stringify('hello')) });
    expect(await cache.get('slot/x')).toBe('hello');
  });

  it('set serializes and get returns the same value', async () => {
    const cache = createElementCache();
    await cache.set('slot/x', () => 'world');
    expect(await cache.get('slot/x')).toBe('world');
    expect(serializeRsc).toHaveBeenCalledTimes(1);
  });

  it('repeated set for one cache id does not replace or reserialize', async () => {
    const cache = createElementCache();
    await cache.set('slot/x', () => 'first');
    await cache.set('slot/x', () => 'second');
    expect(await cache.get('slot/x')).toBe('first');
    expect(serializeRsc).toHaveBeenCalledTimes(1);
  });

  it('get returns undefined for an unknown cache id', () => {
    const cache = createElementCache();
    expect(cache.get('slot/missing')).toBeUndefined();
  });

  it('onSerialize persists bytes that another cache can restore', async () => {
    const onSerialize = vi.fn();
    const cache = createElementCache(onSerialize);
    await cache.set('slot/x', () => 'a');
    await cache.set('slot/x', () => 'b');
    expect(onSerialize).toHaveBeenCalledTimes(1);
    expect(onSerialize.mock.calls[0]![0]).toBe('slot/x');
    const restored = createElementCache();
    restored.preload('slot/x', onSerialize.mock.calls[0]![1]);
    expect(await restored.get('slot/x')).toBe('a');
  });

  it('slot and path-spec cache ids are stable', () => {
    expect(getSlotCacheId('main')).toBe('slot/main');
    expect(getSlotCacheId('main')).toBe(getSlotCacheId('main'));
    const pathSpec: PathSpec = [{ type: 'literal', name: 'foo' }];
    expect(getPathSpecCacheId(pathSpec)).toBe(
      `pathSpec/${JSON.stringify(pathSpec)}`,
    );
  });

  it('rejects reserved slot ids', () => {
    for (const id of ['root', 'route:home', 'slice:sidebar', 'Main']) {
      expect(() => assertNonReservedSlotId(id)).toThrow('Element ID cannot be');
    }
  });

  it('accepts ordinary lowercase custom element ids', () => {
    for (const id of ['main', 'my-element', 'foo123']) {
      expect(() => assertNonReservedSlotId(id)).not.toThrow();
    }
  });
});
