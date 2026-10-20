import { unstable_rerenderRoute as rerenderRoute } from 'waku/router/server';
import { StaticRedirect } from '../components/StaticRedirect';

async function rerender() {
  'use server';
  rerenderRoute('/login');
  return 'done';
}

export default function Login() {
  return <StaticRedirect action={rerender} />;
}

export const getConfig = () => ({ render: 'static' }) as const;
