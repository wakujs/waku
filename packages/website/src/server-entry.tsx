import { fsRouter } from 'waku';
import adapter from 'waku/adapters/vercel';

const handler: ReturnType<typeof adapter> = adapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
  { static: true },
);

export default handler;
