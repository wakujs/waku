import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default async function SyncPage() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  requestRedirect('/destination');
  cancelRender();
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
