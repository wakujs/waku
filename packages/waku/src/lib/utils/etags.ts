export const ETAG_ID_PREFIX = '_etag:';
export const ETAGS_HEADER = 'X-Waku-Etags';

// Non-string sentinel, so it cannot collide with a (string) content validator.
export const IMMUTABLE_ETAG = 1;

export type Etag = string | typeof IMMUTABLE_ETAG;
export type Etags = Record<string, Etag>;

// '' clears a tag; a non-Latin1 string cannot ride in a header
export const isValidEtag = (value: unknown): value is Etag =>
  value === IMMUTABLE_ETAG ||
  (typeof value === 'string' && value !== '' && /^[ -ÿ]+$/.test(value));

export const parseClientEtags = (serialized: string | null): Etags => {
  if (!serialized) {
    return {};
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {};
  }
  const etags: Etags = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (isValidEtag(value)) {
      etags[key] = value;
    }
  }
  return etags;
};

export const serializeClientEtags = (etags: Etags): string =>
  JSON.stringify(etags);
