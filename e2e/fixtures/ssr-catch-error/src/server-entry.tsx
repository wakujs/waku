/// <reference types="vite/client" />
import adapter from 'waku/adapters/default';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import validatorMiddleware from './middleware/validator';

export default adapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [validatorMiddleware] },
);
