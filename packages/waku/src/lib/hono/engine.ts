import { Hono } from 'hono';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../types.js';
import {
  contextMiddleware,
  staticMiddleware,
  rscMiddleware,
  notFoundMiddleware,
} from './middleware.js';

export function createApp(args: CreateAppArgs, app = new Hono()) {
  app.use(contextMiddleware());
  if (!args.deployAdapter) {
    app.use(staticMiddleware(args));
  }
  app.use(rscMiddleware(args));
  if (!args.deployAdapter) {
    app.use(notFoundMiddleware(args));
  }
  return app;
}
