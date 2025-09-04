import { unstable_rerenderRoute } from 'waku/router/server';
import { Counter } from '../components/counter';
import { env } from 'cloudflare:workers';

export default async function HomePage() {
  return (
    <div>
      <h4>Dynamic</h4>
      <Counter />
      <ServerCounter />
    </div>
  );
}

async function ServerCounter() {
  const count = Number((await env.MY_KV.get('counter')) || '0');
  return (
    <form
      action={async () => {
        'use server';
        await env.MY_KV.put('counter', String(count + 1));
        unstable_rerenderRoute('/');
      }}
    >
      <button data-testid="server-counter">Server counter: {count}</button>
    </form>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
