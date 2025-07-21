// https://github.com/wakujs/waku/pull/1539

'use client';

import { use } from 'react';

export function TestClient({ promise }: { promise: Promise<string> }) {
  const data = use(promise);
  return <div data-testid="resolved-promise">{data}</div>;
}
