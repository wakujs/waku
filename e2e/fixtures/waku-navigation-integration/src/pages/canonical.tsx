import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function CanonicalPage({ query = '' }: { query?: string }) {
  const v = new URLSearchParams(query).get('v');
  if (v === 'old') {
    requestRedirect('/canonical?v=new');
    cancelRender();
  }
  return <h1 data-testid="canonical">Canonical {v ?? ''}</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
