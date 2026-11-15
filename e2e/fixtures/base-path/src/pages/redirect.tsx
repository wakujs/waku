import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function RedirectPage() {
  requestRedirect('/static');
  return cancelRender();
}

export const getConfig = async () => ({ render: 'dynamic' as const });
