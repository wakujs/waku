import { Suspense } from 'react';
import { unstable_redirect as redirect } from 'waku/router/server';

const Late = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  redirect(
    new URL('/from-late', String(process.env.WAKU_E2E_EXTERNAL_ORIGIN))
      .href as '/',
    303,
  );
};

export default async function ExternalLatePage() {
  return (
    <div>
      <h1>External Late Page</h1>
      <Suspense fallback={<p>loading</p>}>
        <Late />
      </Suspense>
    </div>
  );
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
