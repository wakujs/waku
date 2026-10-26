import { requestNotFound } from 'waku/router/server';

export default function IntentMissing() {
  requestNotFound();
  return null;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
