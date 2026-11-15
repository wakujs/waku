import { unstable_cancelRender as cancelRender } from 'waku/minimal/server';
import { requestRedirect } from 'waku/router/server';

export default function OldPage() {
  requestRedirect('/new');
  cancelRender();
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
