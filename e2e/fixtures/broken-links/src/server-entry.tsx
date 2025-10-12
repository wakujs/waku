/// <reference types="vite/client" />
import { nodeAdapter } from 'waku/adapters/node';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import redirectsMiddleware from './middleware/redirects';

export default nodeAdapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [redirectsMiddleware] },
);
