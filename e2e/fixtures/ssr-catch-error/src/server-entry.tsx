/// <reference types="vite/client" />
import { Hono } from 'hono';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/server';

import validatorMiddleware from './middleware/validator';

export default defineServer({
  ...fsRouter(
    import.meta.glob('/src/pages/**/*.{tsx,ts}', { base: '/src/pages' }),
    { apiDir: 'api', slicesDir: '_slices' },
  ),
  createFetch: (args) => {
    const app = new Hono();
    app.use(honoMiddleware.contextMiddleware());
    app.use(validatorMiddleware());
    app.use(honoMiddleware.staticMiddleware(args));
    app.use(honoMiddleware.rscMiddleware(args));
    app.use(honoMiddleware.notFoundMiddleware(args));
    return async (req) => app.fetch(req);
  },
});
