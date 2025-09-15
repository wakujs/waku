/// <reference types="vite/client" />
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_engine as engine } from 'waku/server';

import cloudflareMiddleware from './middleware/cloudflare';

export default defineServer({
  ...fsRouter(
    import.meta.glob('/src/pages/**/*.{tsx,ts}', { base: '/src/pages' }),
    { apiDir: 'api', slicesDir: '_slices' },
  ),
  createFetch: (args) => {
    const app = new Hono();
    app.use(contextStorage());
    app.use(engine.contextMiddleware());
    app.use(cloudflareMiddleware());
    // app.use(engine.staticMiddleware(args));
    app.use(engine.rscMiddleware(args));
    if (import.meta.env && !import.meta.env.PROD) {
      app.use(engine.notFoundMiddleware(args));
      const handlerPromise = import('./waku.cloudflare-dev-server').then(
        ({ cloudflareDevServer }) =>
          cloudflareDevServer({
            // Optional config settings for the Cloudflare dev server (wrangler proxy)
            // https://developers.cloudflare.com/workers/wrangler/api/#parameters-1
            persist: {
              path: '.wrangler/state/v3',
            },
          }),
      );
      return async (req) => {
        const devHandler = await handlerPromise;
        return devHandler(req, app);
      };
    }
    return async (req) => app.fetch(req);
  },
});

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
