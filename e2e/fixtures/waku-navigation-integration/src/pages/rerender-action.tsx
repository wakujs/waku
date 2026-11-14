import {
  requestRefresh,
  unstable_rerenderRoute as rerenderRoute,
} from 'waku/router/server';

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
          rerenderRoute('/static');
        }}
      >
        <button type="submit" data-testid="render-static">
          Render static
        </button>
      </form>
      <form
        action={async () => {
          'use server';
          rerenderRoute('/old');
        }}
      >
        <button type="submit" data-testid="render-redirect">
          Render redirect
        </button>
      </form>
      <form
        action={async () => {
          'use server';
          rerenderRoute('/rerender-action');
        }}
      >
        <button type="submit" data-testid="render-same">
          Render same route
        </button>
      </form>
    </div>
  );
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
