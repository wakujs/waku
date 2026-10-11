'use client';

import { useSearch_UNSTABLE as useSearch } from 'waku/router/client';
import { zodSearchCodec } from '../lib/zod-search';

const searchRoute = { path: '/zod-search', searchCodec: zodSearchCodec };

export function ZodSearchControls() {
  const search = useSearch(searchRoute);
  return <p data-testid="zod-client-search">{JSON.stringify(search)}</p>;
}
