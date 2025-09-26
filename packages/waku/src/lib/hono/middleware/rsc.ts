import type { MiddlewareHandler } from 'hono';
import type { Unstable_ProcessRequest as ProcessRequest } from '../../types.js';

export default function rscMiddleware(args: {
  processRequest: ProcessRequest;
}): MiddlewareHandler {
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
