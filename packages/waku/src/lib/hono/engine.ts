import { Hono } from 'hono';
import type { Unstable_CreateFetchArgs as CreateFetchArgs } from '../types.js';
import {
  contextMiddleware,
  staticMiddleware,
  rscMiddleware,
  notFoundMiddleware,
} from './middleware.js';

export function createFetch(args: CreateFetchArgs) {
  const app = new Hono();
  app.use(contextMiddleware());
  app.use(staticMiddleware(args));
  app.use(rscMiddleware(args));
  app.use(notFoundMiddleware(args));
  return async (req: Request) => app.fetch(req);
}
