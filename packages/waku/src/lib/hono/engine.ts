import { Hono } from 'hono';
import type { Unstable_CreateFetchArgs as CreateFetchArgs } from '../types.js';
import contextMiddleware from './middleware/context.js';
import staticMiddleware from './middleware/static.js';
import rscMiddleware from './middleware/rsc.js';
import notFoundMiddleware from './middleware/not-found.js';

export {
  contextMiddleware,
  staticMiddleware,
  rscMiddleware,
  notFoundMiddleware,
};

export function createFetch(args: CreateFetchArgs) {
  const app = new Hono();
  app.use(contextMiddleware());
  app.use(staticMiddleware(args));
  app.use(rscMiddleware(args));
  app.use(notFoundMiddleware(args));
  return async (req: Request) => app.fetch(req);
}
