import { unstable_redirect as redirect } from 'waku/router/server';

export default function MixBudgetAPage({ query = '' }: { query?: string }) {
  const cycle =
    new URLSearchParams(query).get('mixcycle') === 'same' ? 'same' : 'a';
  redirect(`/mix-b?mixcycle=${cycle}` as '/');
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
