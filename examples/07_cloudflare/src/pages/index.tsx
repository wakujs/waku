import { Suspense } from 'react';
import { env, waitUntil } from 'cloudflare:workers'; // eslint-disable-line import/no-unresolved
import { Link } from 'waku';
import { Counter } from '../components/counter';
import { unstable_getContext as getContext } from 'waku/server';

export default async function HomePage() {
  const data = await getData();
  const { req } = getContext();

  // Example: invoking waitUntil() on the Cloudflare executionCtx.
  // https://hono.dev/docs/api/context#executionctx
  waitUntil(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log(
          'Cloudflare waitUntil() promise resolved. The server response does not wait for this.',
        );
        resolve();
      }, 1000);
    }),
  );

  const maxItems = env.MAX_ITEMS;

  return (
    <div>
      <title>{data.title}</title>
      <h1 className="text-4xl font-bold tracking-tight">{data.headline}</h1>
      <p>{data.body}</p>
      <p>MAX_ITEMS = {maxItems}.</p>
      <Suspense fallback="Pending...">
        <ServerMessage />
      </Suspense>
      <Counter max={maxItems} />
      <Link to="/about" className="mt-4 inline-block underline">
        About page
      </Link>
    </div>
  );
}

// Example async server component
const ServerMessage = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return <p>Hello from server!</p>;
};

// Example async data fetching
const getData = async () => {
  const data = {
    title: 'Waku',
    headline: 'Waku',
    body: 'Hello world!',
  };

  return data;
};

// Enable dynamic server rendering.
// Static rendering is possible if you want to render at build time.
// The Hono context will not be available.
export const getConfig = async () => {
  return {
    render: 'dynamic',
  } as const;
};
