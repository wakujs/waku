import { requestRedirect, requestRefresh } from 'waku/router/server';

let count = 0;

export default function RerenderActionPage() {
  return (
    <div>
      <p data-testid="rerender-count">{count}</p>
      <form
        action={async () => {
          'use server';
          count += 1;
          requestRefresh();
        }}
      >
        <button type="submit" data-testid="rerender">
          Rerender
        </button>
      </form>
      <form
        action={async () => {
          'use server';
          requestRedirect('/old');
        }}
      >
        <button type="submit" data-testid="render-redirect">
          Render redirect
        </button>
      </form>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
