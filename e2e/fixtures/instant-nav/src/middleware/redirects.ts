import type { MiddlewareHandler } from 'hono';
import {
  unstable_formatRouterRequest as formatRouterRequest,
  unstable_parseRouterRequest as parseRouterRequest,
} from 'waku/router/server';

const redirectsMiddleware = (): MiddlewareHandler => async (c, next) => {
  const route = parseRouterRequest(c.req.raw);
  if (
    route?.type === 'route' &&
    route.path === '/post/1' &&
    route.query === 'redirect=1'
  ) {
    const location = formatRouterRequest(
      c.req.raw,
      '/login',
      'callbackUrl=%2Fpost%2F1',
    );
    if (location) {
      return c.redirect(location.pathname + location.search, 303);
    }
  }
  return next();
};

export default redirectsMiddleware;
