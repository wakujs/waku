import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default async function ExternalPage() {
  // the spec listens on this origin and passes it in when it starts the app
  requestRedirect(
    new URL('/from-render', String(process.env.WAKU_E2E_EXTERNAL_ORIGIN)),
  );
  cancelRender();
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
