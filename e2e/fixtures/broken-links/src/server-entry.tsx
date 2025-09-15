/// <reference types="vite/client" />
import { Hono } from 'hono';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/server';

import redirectsMiddleware from './middleware/redirects';

export default defineServer({
  ...fsRouter(
    import.meta.glob('/src/pages/**/*.{tsx,ts}', { base: '/src/pages' }),
    { apiDir: 'api', slicesDir: '_slices' },
  ),
  createApp: (args, baseApp) => {
    const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
    app.use(honoMiddleware.contextMiddleware());
    app.use(redirectsMiddleware());
    app.use(honoMiddleware.staticMiddleware(args));
    app.use(honoMiddleware.rscMiddleware(args));
    app.use(honoMiddleware.notFoundMiddleware(args));
    return app;
  },
});
