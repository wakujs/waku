import { requestRefresh } from 'waku/router/server';
import { StaticRedirect } from '../components/static-redirect';

async function rerender() {
  'use server';
  requestRefresh();
  return 'done';
}

export default function Login() {
  return <StaticRedirect action={rerender} />;
}

export const getConfig = () => ({ render: 'static' }) as const;
