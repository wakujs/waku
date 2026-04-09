import { trimTrailingSlash } from 'hono/trailing-slash';

export default () => trimTrailingSlash({ alwaysRedirect: true });

// Usage of appendTrailingSlash
/*
import type { MiddlewareHandler } from 'hono';
import { appendTrailingSlash } from 'hono/trailing-slash';

export default (): MiddlewareHandler => {
  const middleware = appendTrailingSlash({ alwaysRedirect: true });
  return (c, next) => {
    const lastSegment = new URL(c.req.url).pathname.split('/').pop() || '';
    if (lastSegment.includes('.')) {
      return next();
    }
    return middleware(c, next);
  };
};
*/
