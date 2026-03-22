import * as cookie from 'cookie';
import type { MiddlewareHandler } from 'hono';
import { unstable_getContextData as getContextData } from 'waku/server';

// XXX we would probably like to extend config.
const COOKIE_OPTS = {};

const cookieMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    const data = getContextData();
    const cookies = cookie.parse(c.req.header('cookie') || '');
    data.count = Number(cookies.count) || 0;
    await next();
    if (c.res) {
      const headers = new Headers(c.res.headers);
      headers.append(
        'set-cookie',
        cookie.serialize('count', String(data.count), COOKIE_OPTS),
      );
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers,
      });
    }
  };
};

export default cookieMiddleware;
