import { Suspense } from 'react';
import { requestRedirect } from 'waku/router/server';

async function LateRedirect() {
  await fetch(`${process.env.WAKU_E2E_EXTERNAL_ORIGIN}/redirect-gate`);
  requestRedirect('/destination');
  return null;
}

export default function IntentLateRedirect() {
  return (
    <Suspense fallback={<h1>Intent redirect shell</h1>}>
      <LateRedirect />
    </Suspense>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
