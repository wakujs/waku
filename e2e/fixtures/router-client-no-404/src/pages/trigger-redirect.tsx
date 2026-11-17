import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function TriggerRedirectPage() {
  requestRedirect('/next?from=redirect');
  cancelRender();
}

export const getConfig = () => {
  return {
    render: 'dynamic',
  } as const;
};
