import { Hono } from 'hono';
import type { Unstable_CreateApp as CreateApp } from '../types.js';
import { contextMiddleware, rscMiddleware } from './middleware.js';

export const createApp: CreateApp = (args, baseApp) => {
  const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
  app.use(contextMiddleware());
  app.use(rscMiddleware(args));
  return app;
};
