import type { ReactNode } from 'react';
import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import { unstable_isRenderCancellation as isRenderCancellation } from 'waku/minimal/server';
import { deserializeRsc, serializeRsc } from 'waku/server';
import type { RouteIntentData } from '../isomorphic-utils/router-protocol.js';
import { captureRouteIntent, getRouteIntent } from './request-store.js';

export const ROOT_SLOT_ID = 'root';

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

export const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

export type CacheId = string;

export type SerializedElement = {
  data: string;
  intent?: RouteIntentData | undefined;
};

export const createElementCache = (
  onSerialize?: (cacheId: CacheId, entry: SerializedElement) => void,
) => {
  const cache = new Map<
    CacheId,
    Promise<{ result: Uint8Array; intent: RouteIntentData | undefined }>
  >();
  return {
    preload: (cacheId: CacheId, { data, intent }: SerializedElement) => {
      cache.set(
        cacheId,
        Promise.resolve({ result: base64ToBytes(data), intent }),
      );
    },
    has: (cacheId: CacheId) => cache.has(cacheId),
    get: (cacheId: CacheId) =>
      cache.get(cacheId)?.then(({ result, intent }) => {
        if (intent) {
          getRouteIntent().record(intent);
        }
        return deserializeRsc(result) as Promise<ReactNode>;
      }),
    set: async (cacheId: CacheId, render: ElementSource['render']) => {
      if (cache.has(cacheId)) {
        return;
      }
      const entry = captureRouteIntent(async () => {
        let element;
        try {
          element = await render();
        } catch (error) {
          if (!isRenderCancellation(error)) {
            throw error;
          }
          element = null;
        }
        return serializeRsc(element);
      });
      cache.set(cacheId, entry);
      const { result, intent } = await entry;
      onSerialize?.(cacheId, { data: bytesToBase64(result), intent });
    },
  };
};

export type ElementCache = ReturnType<typeof createElementCache>;

export const cacheElementSource = (
  source: ElementSource,
  cacheId: CacheId,
  cache: ElementCache,
  populate = true,
): ElementSource =>
  source.immutable
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

export const getSlotCacheId = (slotId: string): CacheId => `slot/${slotId}`;

export const getElementCacheId = (
  slotId: string,
  source: ElementSource & { cacheKey?: string },
) =>
  source.cacheKey === undefined
    ? getSlotCacheId(slotId)
    : `key/${source.cacheKey}`;
