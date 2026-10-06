import type { Unstable_SearchCodec } from 'waku/router';

export const searchCodec: Unstable_SearchCodec<{ q: string }> = {
  id: 'define-router-search',
  parse: (query) => ({ q: new URLSearchParams(query).get('q') || '' }),
  serialize: (search) => new URLSearchParams(search).toString(),
};

declare module 'waku/router' {
  interface SearchCodecsConfig {
    '/foo': typeof searchCodec;
  }
}
