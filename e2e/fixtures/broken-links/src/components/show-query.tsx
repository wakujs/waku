'use client';

import { useRouter } from 'waku';

export function ShowQuery() {
  const { path, query } = useRouter();
  return <p data-testid="route-query">{`${path}?${query}`}</p>;
}
