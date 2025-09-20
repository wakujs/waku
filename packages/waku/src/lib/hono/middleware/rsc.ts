import type { MiddlewareHandler } from 'hono';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../../types.js';

export default function rscMiddleware(args: CreateAppArgs): MiddlewareHandler {
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
