import { Suspense } from 'react';
import { requestRedirect } from 'waku/router/server';
import { waitForRelease } from '../lib/late-redirect-gate.js';

// Requests the redirect once the spec releases it. The marker renders after
// the request, so the redirect reaches the client no later than the marker.
const LateRedirect = async ({ id }: { id: string }) => {
  await waitForRelease(id);
  requestRedirect('/new');
  return <p data-testid="late-redirect-sent">Redirect requested</p>;
};

export default function LateRedirectPage({ query = '' }: { query?: string }) {
  const id = new URLSearchParams(query).get('id') ?? '';
  return (
    <div>
      <h1 data-testid="late-redirect">Late redirect</h1>
      <p id="details">Details</p>
      <Suspense fallback={null}>
        <LateRedirect id={id} />
      </Suspense>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
