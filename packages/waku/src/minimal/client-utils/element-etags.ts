import {
  ETAGS_ID,
  IMMUTABLE_ETAG,
  isValidEtag,
} from '../../lib/utils-isomorphic/etags.js';
import type { Etag, Etags } from '../../lib/utils-isomorphic/etags.js';

type Elements = Readonly<Record<string | symbol, unknown>>;

export type ElementResponse = Readonly<{ url: string; redirected: boolean }>;

type SlotMetadata = Map<
  string | symbol,
  { etag?: Etag; response?: ElementResponse }
>;

const slotMetadataByElements = new WeakMap<Elements, SlotMetadata>();

const ensureSlotMetadata = (elements: Elements): SlotMetadata => {
  let metadata = slotMetadataByElements.get(elements);
  if (!metadata) {
    metadata = new Map();
    slotMetadataByElements.set(elements, metadata);
  }
  return metadata;
};

/** Whether the server delivered the element under `slotId` as immutable. */
export const isImmutableElement = (
  elements: Elements,
  slotId: string,
): boolean =>
  slotMetadataByElements.get(elements)?.get(slotId)?.etag === IMMUTABLE_ETAG;

/**
 * Returns the final URL and redirect status of the response that supplied an
 * element, without exposing its body. Cached records retain this metadata;
 * `unstable_combineElements` carries it with each selected value. Plain copies
 * and client-created values have none. Metadata can also be unavailable for
 * a new body whose source cannot be identified among several fetched responses.
 */
export const getElementResponse = (
  elements: Elements,
  slotId: string,
): ElementResponse | undefined =>
  slotMetadataByElements.get(elements)?.get(slotId)?.response;

export const collectEtags = (elements: Elements): Etags =>
  Object.fromEntries(
    [...(slotMetadataByElements.get(elements) ?? [])].flatMap(
      ([key, { etag }]) => (etag === undefined ? [] : [[key, etag]]),
    ),
  );

export const adoptElements = (
  data: Elements,
  response?: ElementResponse,
): Elements => {
  const elements = Object.fromEntries(
    Object.entries(data).filter(([key]) => !key.startsWith('_')),
  );
  const etags = (data[ETAGS_ID] as Record<string, unknown> | undefined) ?? {};
  const metadata = ensureSlotMetadata(elements);
  for (const [slotId, etag] of Object.entries(etags)) {
    if (Object.hasOwn(elements, slotId) && isValidEtag(etag)) {
      metadata.set(slotId, { etag });
    }
  }
  if (response) {
    for (const slotId of Object.keys(elements)) {
      metadata.set(slotId, { ...metadata.get(slotId), response });
    }
  }
  return elements;
};

const copyElement = (
  target: Record<string | symbol, unknown>,
  source: Elements,
  key: string | symbol,
): void => {
  target[key] = source[key];
  const metadata = slotMetadataByElements.get(source)?.get(key);
  if (metadata === undefined) {
    slotMetadataByElements.get(target)?.delete(key);
  } else {
    ensureSlotMetadata(target).set(key, metadata);
  }
};

/**
 * Returns a new record with the entries of `b` over those of `a`, keeping the
 * etags and response metadata each value arrived with. Use this rather than a
 * spread or `Object.assign`, which drop them. With `filter`, only the
 * keys of `b` it accepts are taken.
 */
export const combineElements = (
  a: Elements,
  b: Elements,
  options?: { filter?: (key: string | symbol) => boolean },
): Elements => {
  const filter = options?.filter;
  const combined: Record<string | symbol, unknown> = {};
  for (const key of Reflect.ownKeys(a)) {
    copyElement(combined, a, key);
  }
  for (const key of Reflect.ownKeys(b)) {
    if (!filter || filter(key)) {
      copyElement(combined, b, key);
    }
  }
  return combined;
};
