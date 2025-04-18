import type { Middleware } from 'waku/config';
import wakuConfig from '../../waku.config.js';

const { rscBase } = wakuConfig;

const stringToStream = (str: string): ReadableStream => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

const validateMiddleware: Middleware = () => {
  return async (ctx, next) => {
    if (ctx.req.url.pathname === '/invalid') {
      ctx.res.status = 401;
      ctx.res.body = stringToStream('Unauthorized');
      return;
    }
    if (ctx.req.url.pathname.startsWith(`/${rscBase}/R/invalid`)) {
      ctx.data.unauthorized = true;
    }
    await next();
  };
};

export default validateMiddleware;
