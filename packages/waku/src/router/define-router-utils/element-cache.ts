import type { ReactNode } from 'react';
import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import { deserializeRsc, serializeRsc } from 'waku/server';

export const ROOT_SLOT_ID = 'root';

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export type CacheId = string;

export function createElementCache(
  onSerialize?: (cacheId: CacheId, data: string) => void,
) {
  const cache = new Map<CacheId, Promise<Uint8Array>>();
  return {
    preload: (cacheId: CacheId, data: string) => {
      cache.set(cacheId, Promise.resolve(base64ToBytes(data)));
    },
    has: (cacheId: CacheId) => cache.has(cacheId),
    get: (cacheId: CacheId) =>
      cache
        .get(cacheId)
        ?.then((result) => deserializeRsc(result) as Promise<ReactNode>),
    set: async (cacheId: CacheId, render: ElementSource['render']) => {
      if (cache.has(cacheId)) {
        return;
      }
      const entry = (async () => serializeRsc(await render()))().catch(
        (error) => {
          if (cache.get(cacheId) === entry) {
            cache.delete(cacheId);
          }
          throw error;
        },
      );
      cache.set(cacheId, entry);
      const result = await entry;
      onSerialize?.(cacheId, bytesToBase64(result));
    },
  };
}

export type ElementCache = ReturnType<typeof createElementCache>;

export function cacheElementSource(
  source: ElementSource,
  cacheId: CacheId,
  cache: ElementCache,
  populate = true,
): ElementSource {
  return source.immutable
    ? {
        ...source,
        render: async () => {
          if (!cache.has(cacheId)) {
            if (!populate) {
              return source.render();
            }
            await cache.set(cacheId, source.render);
          }
          return cache.get(cacheId);
        },
      }
    : source;
}

const getSlotCacheId = (slotId: string): CacheId => `slot/${slotId}`;
export const getSlotCacheIdForTest = getSlotCacheId;

export function getElementCacheId(
  slotId: string,
  source: ElementSource & { cacheKey?: string },
) {
  return source.cacheKey === undefined
    ? getSlotCacheId(slotId)
    : `key/${source.cacheKey}`;
}
