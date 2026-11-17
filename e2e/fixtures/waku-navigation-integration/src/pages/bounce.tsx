import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function BouncePage({ query = '' }: { query?: string }) {
  const v = new URLSearchParams(query).get('v');
  if (v === 'a') {
    requestRedirect('/bounce?v=b');
    cancelRender();
  }
  if (v === 'b') {
    requestRedirect('/bounce?v=a');
    cancelRender();
  }
  return <h1 data-testid="bounce">Bounce {v ?? ''}</h1>;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
