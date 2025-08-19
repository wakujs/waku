// Workaround https://github.com/cloudflare/workers-sdk/issues/6577
import type { Middleware } from 'waku/config';

function isWranglerDev(headers: Headers): boolean {
  // This header seems to only be set for production cloudflare workers
  return !headers.has('cf-visitor');
}

const cloudflareMiddleware: Middleware = () => {
  return async (ctx, next) => {
    await next();
    if (!import.meta.env?.PROD) {
      return;
    }
    if (!isWranglerDev(ctx.req.headers)) {
      return;
    }
    if (ctx.res) {
      const contentType = ctx.res.headers.get('content-type');
      if (
        !contentType ||
        contentType.includes('text/html') ||
        contentType.includes('text/plain')
      ) {
        const headers = new Headers(ctx.res.headers);
        headers.set('content-encoding', 'Identity');
        ctx.res = new Response(ctx.res.body, {
          status: ctx.res.status,
          statusText: ctx.res.statusText,
          headers: ctx.res.headers,
        });
      }
    }
  };
};

export default cloudflareMiddleware;
