import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function MixBudgetAPage({ query = '' }: { query?: string }) {
  const cycle =
    new URLSearchParams(query).get('mixcycle') === 'same' ? 'same' : 'a';
  requestRedirect(`/mix-b?mixcycle=${cycle}` as '/');
  cancelRender();
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
