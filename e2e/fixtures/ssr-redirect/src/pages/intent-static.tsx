import { requestRedirect } from 'waku/router/server';

export default function IntentStaticRedirect() {
  requestRedirect('/destination');
  return null;
}

export const getConfig = () => ({ render: 'static' }) as const;
