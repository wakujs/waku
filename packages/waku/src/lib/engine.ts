import path from 'node:path';
import fs from 'node:fs';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type {
  Unstable_MiddlewareArgs as MiddlewareArgs,
  Unstable_CreateFetch as CreateFetch,
} from './types.js';
import { runWithContext } from './context.js';
import { DIST_PUBLIC } from './builder/constants.js';
import { INTERNAL_setAllEnv } from '../server.js';

export function contextMiddleware(_args: MiddlewareArgs): MiddlewareHandler {
  return (c, next) => {
    const req = c.req.raw;
    return runWithContext(req, next);
  };
}

export function staticMiddleware(args: MiddlewareArgs): MiddlewareHandler {
  const { config, isBuild } = args;
  if (isBuild) {
    return serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) });
  }
  return (_c, next) => next();
}

export function rscMiddleware(args: MiddlewareArgs): MiddlewareHandler {
  const { processRequest } = args;
  return async (c, next) => {
    const req = c.req.raw;
    const res = await processRequest(req);
    if (res) {
      c.res = res;
      return;
    }
    await next();
  };
}

export function notFoundMiddleware(args: MiddlewareArgs): MiddlewareHandler {
  const { config } = args;
  return async (c) => {
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  };
}

export const createFetch: CreateFetch = (
  args: MiddlewareArgs,
  middlewares = [
    contextMiddleware,
    staticMiddleware,
    rscMiddleware,
    notFoundMiddleware,
  ],
) => {
  const app = new Hono();
  INTERNAL_setAllEnv(process.env as any);
  for (const m of middlewares) {
    app.use(m(args));
  }
  return async (req) => app.fetch(req);
};
