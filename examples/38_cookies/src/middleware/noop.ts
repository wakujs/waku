import type { Middleware } from 'waku/config';

const noopMiddleware: Middleware = () => {
  return async (_ctx, next) => {
    await next();
  };
};

export default noopMiddleware;
