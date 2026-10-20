'use client';

import { useActionState } from 'react';
import { useRouter } from 'waku/router/client';

export function StaticRedirect({ action }: { action: () => Promise<string> }) {
  const { path, query } = useRouter();
  const [state, formAction] = useActionState(action, 'idle');
  return (
    <div>
      <p data-testid="route-query">{path + '?' + query}</p>
      <form action={formAction}>
        <button type="submit">Rerender static route</button>
      </form>
      <p data-testid="rerender-result">{state}</p>
    </div>
  );
}
