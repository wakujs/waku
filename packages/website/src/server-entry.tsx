/// <reference types="vite/client" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { vercelAdapter } from 'waku/adapters/vercel';

export default vercelAdapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
  { static: true },
);
