'use client';

import { use } from 'react';

// A client-only suspense with no data fetch. A suspended route is invisible
// during a transition (the old page stays mounted), so there is no DOM element
// to drive it from; the resolver is exposed on the global instead, and the test
// releases it on demand via window.__resolveClientSuspense().
let resolveClientSuspense = () => {};
const clientSuspensePromise = new Promise<void>((resolve) => {
  resolveClientSuspense = resolve;
});
(
  globalThis as unknown as { __resolveClientSuspense?: () => void }
).__resolveClientSuspense = resolveClientSuspense;

export function ClientSuspense() {
  use(clientSuspensePromise);
  return <p data-testid="client-suspense-content">client loaded</p>;
}
