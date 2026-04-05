import { trimTrailingSlash } from 'hono/trailing-slash';

export default () => trimTrailingSlash({ alwaysRedirect: true });

// Usage of appendTrailingSlash
/*
import { appendTrailingSlash } from 'hono/trailing-slash';

export default () => {
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
