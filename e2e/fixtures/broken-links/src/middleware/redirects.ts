import type { Middleware } from 'waku/config';

// BASE_RSC_PATH + encodeRscPath(rscPath)
const redirects = {
  '/redirect': '/exists',
  '/RSC/R/redirect.txt': '/RSC/R/exists.txt',
  '/broken-redirect': '/broken',
  '/RSC/R/broken-redirect.txt': '/RSC/R/broken.txt',
};

const redirectsMiddleware: Middleware = () => async (ctx, next) => {
  const url = new URL(ctx.req.url);
  if (url.pathname in redirects) {
    const pathname = url.pathname as keyof typeof redirects;
    url.pathname = redirects[pathname];
    ctx.res = new Response(null, {
      status: 302,
      headers: {
        location: url.toString(),
      },
    });
    return;
  }
  return await next();
};

export default redirectsMiddleware;
