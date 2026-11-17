import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect, requestRefresh } from 'waku/router/server';

let count = 0;

export default function NotFoundPage({ query = '' }: { query?: string }) {
  const params = new URLSearchParams(query);
  const cycle = params.get('mixcycle');
  if (cycle === 'same') {
    requestRedirect('/mix-b?mixcycle=same' as '/');
    cancelRender();
  }
  if (cycle === 'a') {
    requestRedirect('/mix-b?mixcycle=b' as '/');
    cancelRender();
  }
  if (cycle === 'b') {
    requestRedirect('/mix-b?mixcycle=a' as '/');
    cancelRender();
  }
  return (
    <div>
      <h1 data-testid="not-found">Custom 404</h1>
      <p data-testid="not-found-count">{count}</p>
      <form
        action={async () => {
          'use server';
          count += 1;
          requestRefresh();
        }}
      >
        <button type="submit" data-testid="not-found-rerender">
          Rerender
        </button>
      </form>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
