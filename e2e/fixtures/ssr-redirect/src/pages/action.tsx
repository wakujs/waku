import { unstable_redirect as redirect } from 'waku/router/server';

export default async function ActionPage() {
  return (
    <div>
      <h1>Action Page</h1>
      <form
        action={async () => {
          'use server';
          redirect('/destination');
        }}
      >
        <button type="submit">Redirect Action</button>
      </form>
    </div>
  );
}
