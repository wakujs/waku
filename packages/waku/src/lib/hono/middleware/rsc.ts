import type { MiddlewareHandler } from 'hono';
import type { Unstable_CreateFetchArgs as CreateFetchArgs } from '../../types.js';

export default function rscMiddleware(
  args: CreateFetchArgs,
): MiddlewareHandler {
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
