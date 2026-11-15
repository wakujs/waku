import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestNotFound } from 'waku/router/server';

export default async function SyncPage() {
  await new Promise((resolve) => setTimeout(resolve, 100));
  requestNotFound();
  cancelRender();
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
