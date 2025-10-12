/// <reference types="vite/client" />
import { Hono } from 'hono';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/internals';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import redirectsMiddleware from './middleware/redirects';

export default defineServer({
  ...fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  createApp: (args, baseApp) => {
    const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
    app.use(honoMiddleware.contextMiddleware());
    app.use(redirectsMiddleware());
    app.use(honoMiddleware.rscMiddleware(args));
    return app;
  },
});
