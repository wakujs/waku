import type { Middleware } from 'waku/config';

const redirectsMiddleware: Middleware = () => async (ctx, next) => {
  const redirects = {
    '/redirect': '/exists',
    '/RSC/R/redirect.txt': '/RSC/R/exists.txt',
    '/broken-redirect': '/broken',
    '/RSC/R/broken-redirect.txt': '/RSC/R/broken.txt',
  };
  if (ctx.req.url.pathname in redirects) {
    const pathname = ctx.req.url.pathname as keyof typeof redirects;
    const url = new URL(ctx.req.url);
    url.pathname = redirects[pathname];
    ctx.res.status = 302;
    ctx.res.headers = {
      Location: url.toString(),
    };
    return;
  }
  return await next();
};

export default redirectsMiddleware;
