// https://github.com/wakujs/waku/pull/1539

'use client';

import React from 'react';

export function TestClient(props: { serverPromise: Promise<string> }) {
  const data = React.use(props.serverPromise);
  return <div data-testid="resolved-promise">{data}</div>;
}
