import type { MiddlewareHandler } from 'hono';
import type { Unstable_ProcessRequest as ProcessRequest } from '../../types.js';

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
