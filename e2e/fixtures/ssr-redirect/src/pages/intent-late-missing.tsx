import { Suspense } from 'react';
import { requestNotFound } from 'waku/router/server';

async function LateNotFound() {
  await fetch(`${process.env.WAKU_E2E_EXTERNAL_ORIGIN}/not-found-gate`);
  requestNotFound();
  return null;
}

export default function IntentLateNotFound() {
  return (
    <Suspense fallback={<h1>Intent not-found shell</h1>}>
      <LateNotFound />
    </Suspense>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
