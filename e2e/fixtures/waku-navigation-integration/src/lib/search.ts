import type { Unstable_SearchCodec } from 'waku/router';

export type QuerySearch = { q: string };

export const querySearchCodec = {
  parse: (query: string): QuerySearch => {
    const sp = new URLSearchParams(query);
    return { q: sp.get('q') ?? '' };
  },
  serialize: (search: QuerySearch): string =>
    new URLSearchParams({ q: search.q }).toString(),
} as const;

querySearchCodec satisfies Unstable_SearchCodec<QuerySearch>;

declare module 'waku/router' {
  interface SearchCodecsConfig {
    '/search': typeof querySearchCodec;
  }
}
