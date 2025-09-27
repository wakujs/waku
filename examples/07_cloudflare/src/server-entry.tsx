/// <reference types="vite/client" />
import { Hono } from 'hono';
import { contextStorage, getContext } from 'hono/context-storage';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_honoMiddleware as honoMiddleware } from 'waku/server';

import cloudflareMiddleware from './middleware/cloudflare';

export default defineServer({
  ...fsRouter(import.meta.glob('./pages/**/*.tsx', { base: './pages/' })),
  createApp: (args, baseApp) => {
    const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
    app.use(contextStorage());
    app.use(honoMiddleware.contextMiddleware());
    app.use(cloudflareMiddleware());
    app.use(honoMiddleware.rscMiddleware(args));
    if (import.meta.env && !import.meta.env.PROD) {
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
      return {
        fetch: async (req: Request) => {
          const devHandler = await handlerPromise;
          return devHandler(req, app);
        },
      };
    }
    return app;
  },
});

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
