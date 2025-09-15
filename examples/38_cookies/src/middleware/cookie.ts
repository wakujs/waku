import * as cookie from 'cookie';
import type { MiddlewareHandler } from 'hono';
import { unstable_getContextData as getContextData } from 'waku/server';

// XXX we would probably like to extend config.
const COOKIE_OPTS = {};

const cookieMiddleware = (): MiddlewareHandler => {
  return async (ctx, next) => {
    const data = getContextData();
    const cookies = cookie.parse(ctx.req.header('cookie') || '');
    data.count = Number(cookies.count) || 0;
    await next();
    if (ctx.res) {
      const headers = new Headers(ctx.res.headers);
      headers.append(
        'set-cookie',
        cookie.serialize('count', String(data.count), COOKIE_OPTS),
      );
      ctx.res = new Response(ctx.res.body, {
        status: ctx.res.status,
        statusText: ctx.res.statusText,
        headers,
      });
    }
  };
};

export default cookieMiddleware;
