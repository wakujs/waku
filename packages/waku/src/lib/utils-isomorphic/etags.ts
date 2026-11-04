export const ETAGS_ID = '_etags';
export const ETAGS_HEADER = 'X-Waku-Etags';

// Non-string sentinel, so it cannot collide with a (string) content validator.
export const IMMUTABLE_ETAG = 1;

export type Etag = string | typeof IMMUTABLE_ETAG;
export type Etags = Record<string, Etag>;

// '' clears a tag; only printable Latin-1 (no control chars) is header-safe
export function isValidEtag(value: unknown): value is Etag {
  return (
    value === IMMUTABLE_ETAG ||
    (typeof value === 'string' &&
      value !== '' &&
      /^[\x20-\x7e\xa0-\xff]+$/.test(value))
  );
}

export function parseClientEtags(serialized: string | null): Etags {
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
}

export function serializeClientEtags(etags: Etags): string {
  return JSON.stringify(etags).replace(
    /[\u007f-\uffff]/g,
    (char) => '\\u' + char.charCodeAt(0).toString(16).padStart(4, '0'),
  );
}
