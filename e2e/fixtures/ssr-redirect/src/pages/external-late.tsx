import { Suspense } from 'react';
import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

const Late = async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  requestRedirect(
    new URL('/from-late', String(process.env.WAKU_E2E_EXTERNAL_ORIGIN))
      .href as '/',
    303,
  );
  cancelRender();
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
