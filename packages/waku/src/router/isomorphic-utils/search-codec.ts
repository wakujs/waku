/**
 * Bring-your-own search-params codec: converts the URL's `query` string to a
 * typed `search` object and back. Waku provides
 * this contract and the integration; the implementation (a library, an adapter
 * for nuqs/zod, or a hand-written object) lives outside core. `parse` may throw
 * to reject a malformed incoming query (the server turns it into a 400).
 * `serialize` owns outbound validation and may throw; it must return an already
 * URL-encoded query string (e.g. via `URLSearchParams.toString()`), which is
 * placed after `?` in the href as-is without invoking `parse`.
 */
export type Unstable_SearchCodec<Search extends Record<string, unknown>> = {
  parse: (query: string) => Search;
  serialize: (search: Search) => string;
};

export type AnyCodec = Unstable_SearchCodec<any>;

export const isCodec = (value: unknown): value is AnyCodec =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as AnyCodec).parse === 'function' &&
  typeof (value as AnyCodec).serialize === 'function';
