import { Hono } from 'hono';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../types.js';
import {
  contextMiddleware,
  staticMiddleware,
  rscMiddleware,
  notFoundMiddleware,
} from './middleware.js';

export function createApp(args: CreateAppArgs, app = new Hono()) {
  app.use(staticMiddleware(args));
  app.use(contextMiddleware());
  app.use(rscMiddleware(args));
  app.use(notFoundMiddleware(args));
  return app;
}
