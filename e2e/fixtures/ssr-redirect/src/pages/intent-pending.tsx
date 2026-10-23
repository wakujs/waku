import { Suspense } from 'react';
import { requestRedirect } from 'waku/router/server';

async function Pending() {
  await new Promise(() => {});
  return null;
}

export default function IntentPendingRedirect() {
  requestRedirect('/destination');
  return (
    <Suspense fallback={<p>Pending</p>}>
      <Pending />
    </Suspense>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
