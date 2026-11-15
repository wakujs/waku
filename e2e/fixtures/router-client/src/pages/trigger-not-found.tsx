import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestNotFound } from 'waku/router/server';

export default function TriggerNotFoundPage() {
  requestNotFound();
  cancelRender();
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
