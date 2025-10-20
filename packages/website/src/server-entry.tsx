/// <reference types="vite/client" />
import vercelAdapter from 'waku/adapters/vercel';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default vercelAdapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
  { static: true },
);
