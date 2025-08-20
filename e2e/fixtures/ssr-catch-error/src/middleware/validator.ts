import type { Middleware } from 'waku/config';
import wakuConfig from '../../waku.config.js';

const { rscBase } = wakuConfig;

const validateMiddleware: Middleware = () => {
  return async (ctx, next) => {
    const url = new URL(ctx.req.url);
    if (url.pathname === '/invalid') {
      ctx.res = new Response('Unauthorized', { status: 401 });
      return;
    }
    if (url.pathname.startsWith(`/${rscBase}/R/invalid`)) {
      ctx.data.unauthorized = true;
    }
    await next();
  };
};

export default validateMiddleware;
