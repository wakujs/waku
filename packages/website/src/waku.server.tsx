import { fsRouter } from 'waku';
import nodeAdapter from 'waku/adapters/node';
import vercelAdapter from 'waku/adapters/vercel';

const adapter: typeof vercelAdapter = process.env.VERCEL
  ? vercelAdapter
  : nodeAdapter;

const handler: ReturnType<typeof adapter> = adapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
  { static: true },
);

export default handler;
