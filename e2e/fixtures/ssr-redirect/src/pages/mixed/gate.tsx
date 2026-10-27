import { requestRedirect } from 'waku/router/server';

export default function Gate() {
  requestRedirect('/destination');
  return null;
}

export const getConfig = async () => ({ render: 'dynamic' }) as const;
