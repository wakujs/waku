import type { MiddlewareHandler } from 'hono';
import { every } from 'hono/combine';
import type { Hono } from 'hono/tiny';
import type { ProcessRequest } from '../types.js';

export function rscMiddleware({
  processRequest,
}: {
  processRequest: ProcessRequest;
}): MiddlewareHandler {
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

export function middlewareRunner(
  middlewareModules: Record<
    string,
    () => Promise<{
      default: (opts: { app: Hono }) => MiddlewareHandler;
    }>
  >,
  opts: { app: Hono },
): MiddlewareHandler {
  let handlerPromise: Promise<MiddlewareHandler> | undefined;
  return async (c, next) => {
    handlerPromise ??= Promise.all(
      Object.values(middlewareModules).map((m) =>
        m().then((mod) => mod.default(opts)),
      ),
    ).then((handlers) => every(...handlers));
    const handler = await handlerPromise;
    await handler(c, next);
  };
}
