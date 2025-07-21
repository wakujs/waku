// https://github.com/wakujs/waku/pull/1539

'use client';

import { use } from 'react';

const promise = Promise.resolve('test');

export function TestClient() {
  const data = use(promise);
  return <div data-testid="resolved-promise">{data}</div>;
}
