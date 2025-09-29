/// <reference types="vite/client" />
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

import validatorMiddleware from './middleware/validator';

export default nodeAdapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [validatorMiddleware] },
);
