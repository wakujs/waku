import { fsRouter } from 'waku';
import nodeAdapter from 'waku/adapters/node';
import vercelAdapter from 'waku/adapters/vercel';

const adapter: typeof vercelAdapter = process.env.VERCEL
  ? vercelAdapter
  : nodeAdapter;

const handler: ReturnType<typeof adapter> = adapter(
  fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')),
  { static: true },
);

export default handler;
