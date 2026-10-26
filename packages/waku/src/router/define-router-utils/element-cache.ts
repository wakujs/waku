import type { ReactNode } from 'react';
import type { Unstable_ElementSource as ElementSource } from 'waku/minimal/server';
import {
  unstable_cancelRender as cancelRender,
  unstable_hasRenderCancellationDigest as hasRenderCancellationDigest,
  unstable_isRenderCancellation as isRenderCancellation,
} from 'waku/minimal/server';
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

const decoder = new TextDecoder();

const hasSerializedRenderCancellation = (bytes: Uint8Array) => {
  let offset = 0;
  while (offset < bytes.length) {
    const colon = bytes.indexOf(58, offset);
    if (colon === -1) {
      break;
    }
    const tag = String.fromCharCode(bytes[colon + 1]!);
    if ('TAOoUSsLlGgMmVb'.includes(tag)) {
      const comma = bytes.indexOf(44, colon + 2);
      if (comma === -1) {
        break;
      }
      offset =
        comma +
        1 +
        parseInt(decoder.decode(bytes.subarray(colon + 2, comma)), 16);
      continue;
    }
    const newline = bytes.indexOf(10, colon + 1);
    if (newline === -1) {
      break;
    }
    if (
      tag === 'E' &&
      hasRenderCancellationDigest(
        JSON.parse(decoder.decode(bytes.subarray(colon + 2, newline))),
      )
    ) {
      return true;
    }
    offset = newline + 1;
  }
  return false;
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
      const result = base64ToBytes(data);
      if (!intent && hasSerializedRenderCancellation(result)) {
        return;
      }
      cache.set(cacheId, Promise.resolve({ result, intent }));
    },
    has: (cacheId: CacheId) => cache.has(cacheId),
    replayIntent: async (cacheId: CacheId) => {
      const entry = await cache.get(cacheId);
      if (entry?.intent) {
        getRouteIntent().record(entry.intent);
      }
    },
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
          if (!isRenderCancellation(error) || !getRouteIntent().value) {
            throw error;
          }
          const cancelled = Promise.reject(error);
          void cancelled.catch(() => {});
          element = cancelled;
        }
        const result = await serializeRsc(element);
        if (
          hasSerializedRenderCancellation(result) &&
          !getRouteIntent().value
        ) {
          cancelRender();
        }
        return result;
      }).catch((error) => {
        if (cache.get(cacheId) === entry) {
          cache.delete(cacheId);
        }
        throw error;
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

const getSlotCacheId = (slotId: string): CacheId => `slot/${slotId}`;
export const getSlotCacheIdForTest = getSlotCacheId;

export const getElementCacheId = (
  slotId: string,
  source: ElementSource & { cacheKey?: string },
) =>
  source.cacheKey === undefined
    ? getSlotCacheId(slotId)
    : `key/${source.cacheKey}`;
