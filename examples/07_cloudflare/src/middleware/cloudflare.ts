// Workaround https://github.com/cloudflare/workers-sdk/issues/6577
import type { Context, MiddlewareHandler } from 'hono';

function isWranglerDev(c: Context): boolean {
  // This header seems to only be set for production cloudflare workers
  return !c.req.header('cf-visitor');
}

const cloudflareMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();
    if (!import.meta.env?.PROD) {
      return;
    }
    if (!isWranglerDev(c)) {
      return;
    }
    const contentType = c.res.headers.get('content-type');
    if (
      !contentType ||
      contentType.includes('text/html') ||
      contentType.includes('text/plain')
    ) {
      const headers = new Headers(c.res.headers);
      headers.set('content-encoding', 'Identity');
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers,
      });
    }
  };
};

export default cloudflareMiddleware;
