/// <reference types="vite/client" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

export default nodeAdapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
);
