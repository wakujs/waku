import type { MiddlewareHandler } from 'hono';
import { unstable_getContextData as getContextData } from 'waku/server';
import wakuConfig from '../../waku.config.js';

const { rscBase } = wakuConfig;

const validateMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const data = getContextData();
    const url = new URL(c.req.raw.url);
    if (url.pathname === '/invalid') {
      c.res = new Response('Unauthorized', { status: 401 });
      return;
    }
    if (url.pathname.startsWith(`/${rscBase}/R/invalid`)) {
      data.unauthorized = true;
    }
    await next();
  };
};

export default validateMiddleware;
