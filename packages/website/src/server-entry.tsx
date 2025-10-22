/// <reference types="vite/client" />
import adapter from 'waku/adapters/vercel';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default adapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
  { static: true },
);
