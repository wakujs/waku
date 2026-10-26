import { requestRedirect } from 'waku/router/server';

export default function IntentRedirect() {
  try {
    requestRedirect('/destination');
  } catch {
    throw new Error('redirect must return normally');
  }
  return null;
}

export const getConfig = () => ({ render: 'dynamic' }) as const;
