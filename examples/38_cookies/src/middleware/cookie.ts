import * as cookie from 'cookie';

import type { Middleware } from 'waku/config';

// XXX we would probably like to extend config.
const COOKIE_OPTS = {};

const cookieMiddleware: Middleware = () => {
  return async (ctx, next) => {
    const cookies = cookie.parse(ctx.req.headers.get('cookie') || '');
    ctx.data.count = Number(cookies.count) || 0;
    await next();
    if (ctx.res) {
      const headers = new Headers(ctx.res.headers);
      headers.append(
        'set-cookie',
        cookie.serialize('count', String(ctx.data.count), COOKIE_OPTS),
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
