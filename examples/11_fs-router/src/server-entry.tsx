/// <reference types="vite/client" />
import { nodeAdapter } from 'waku/adapters/node';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default nodeAdapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
);
