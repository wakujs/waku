import { requestRedirect } from 'waku/router/server';

export default function Gate() {
  requestRedirect('/destination');
  return <p>Redirecting from a static page in a dynamic layout</p>;
}

export const getConfig = async () => ({ render: 'static' }) as const;
