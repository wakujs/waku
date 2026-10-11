'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';
import { nuqsSearchCodec } from '../lib/nuqs-search';

const searchRoute = { path: '/nuqs-search', searchCodec: nuqsSearchCodec };

export function NuqsSearchControls() {
  const search = useSearch(searchRoute);
  return <p data-testid="nuqs-client-search">{JSON.stringify(search)}</p>;
}
