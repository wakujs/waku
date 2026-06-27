import {
  createLoader,
  createSerializer,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server';
import type { Unstable_SearchCodec } from 'waku/router';

const parsers = {
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
};

const loadSearch = createLoader(parsers);
const serializeSearch = createSerializer(parsers);

export type NuqsSearch = { q: string; page: number };

export const nuqsSearchCodec = {
  id: 'nuqs',
  parse: (query: string): NuqsSearch => loadSearch(new URLSearchParams(query)),
  // createSerializer prepends "?"; the codec returns the query without it
  serialize: (search: NuqsSearch): string =>
    serializeSearch(search).replace(/^\?/, ''),
} as const satisfies Unstable_SearchCodec<NuqsSearch>;
