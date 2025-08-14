import type { MiddlewareHandler } from 'hono';
import { createEngine } from './engine.js';

// cf. packages/waku/src/lib/hono/engine.ts
export function createHonoHandler(): MiddlewareHandler {
  const handler = createEngine();

  return async (c, next) => {
    const ctx = await handler({
      req: c.req.raw,
      data: {
        __hono_context: c,
      },
    });
    if (ctx.res.body || ctx.res.status) {
      const status = ctx.res.status || 200;
      const headers = ctx.res.headers || {};
      if (ctx.res.body) {
        return c.body(ctx.res.body, status as never, headers);
      }
      return c.body(null, status as never, headers);
    }
    await next();
  };
}
