import {
  unstable_redirect as redirect,
  unstable_rerenderRoute as rerenderRoute,
} from 'waku/router/server';

let count = 0;

export default function NotFoundPage({ query = '' }: { query?: string }) {
  const params = new URLSearchParams(query);
  if (params.get('mix') === '1') {
    redirect('/mix-b?mix=1' as '/');
  }
  const cycle = params.get('mixcycle');
  if (cycle === 'a') {
    redirect('/mix-b?mixcycle=b' as '/');
  }
  if (cycle === 'b') {
    redirect('/mix-b?mixcycle=a' as '/');
  }
  return (
    <div>
      <h1 data-testid="not-found">Custom 404</h1>
      <p data-testid="not-found-count">{count}</p>
      <form
        action={async () => {
          'use server';
          count += 1;
          rerenderRoute();
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
