'use client';

import {
  useRouter,
  useSearch_UNSTABLE as useSearch,
  useSetSearch_UNSTABLE as useSetSearch,
} from 'waku-navigation';
import { querySearchCodec } from '../lib/search.js';

const searchRoute = { path: '/search', searchCodec: querySearchCodec } as const;

export const SearchProbe = () => {
  const { hash } = useRouter();
  const search = useSearch(searchRoute);
  const setSearch = useSetSearch(searchRoute);
  return (
    <>
      <p data-testid="search">{search ? search.q : 'none'}</p>
      <p data-testid="host-hash">{hash}</p>
      <a href="#a" data-testid="hash-a">
        #a
      </a>
      <a href="#b" data-testid="hash-b">
        #b
      </a>
      <button
        type="button"
        data-testid="set-search"
        onClick={() => {
          void setSearch({ q: 'x' });
        }}
      >
        set
      </button>
      <button
        type="button"
        data-testid="set-search-replace"
        onClick={() => {
          void setSearch({ q: 'x' }, { history: 'replace' });
        }}
      >
        set replace
      </button>
    </>
  );
};
