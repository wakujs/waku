import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default async function ActionPage() {
  return (
    <div>
      <h1>Action Page</h1>
      <form
        action={async () => {
          'use server';
          requestRedirect('/destination', 303);
          cancelRender();
        }}
      >
        <button type="submit">Redirect Action</button>
      </form>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
