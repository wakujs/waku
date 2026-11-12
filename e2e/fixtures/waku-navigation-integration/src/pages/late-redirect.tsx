import { Suspense } from 'react';
import { requestRedirect } from 'waku/router/server';

const LateRedirect = async ({ delay }: { delay: number }) => {
  await new Promise((resolve) => setTimeout(resolve, delay));
  requestRedirect('/new');
  return null;
};

export default function LateRedirectPage({ query = '' }: { query?: string }) {
  const delay = Number(new URLSearchParams(query).get('delay') ?? 1000);
  return (
    <div>
      <h1 data-testid="late-redirect">Late redirect</h1>
      <p id="details">Details</p>
      <Suspense fallback={null}>
        <LateRedirect delay={delay} />
      </Suspense>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
