import type { MiddlewareHandler } from 'hono';

const noopMiddleware = (): MiddlewareHandler => {
  return async (_c, next) => {
    await next();
  };
};

export default noopMiddleware;
