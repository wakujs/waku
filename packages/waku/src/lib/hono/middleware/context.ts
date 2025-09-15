import type { MiddlewareHandler } from 'hono';
import { INTERNAL_runWithContext } from '../../context.js';

export default function contextMiddleware(): MiddlewareHandler {
  return (c, next) => {
    const req = c.req.raw;
    return INTERNAL_runWithContext(req, next);
  };
}
