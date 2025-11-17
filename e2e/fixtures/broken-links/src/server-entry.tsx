/// <reference types="vite/client" />
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import redirectsMiddleware from './middleware/redirects';

export default adapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [redirectsMiddleware] },
);
