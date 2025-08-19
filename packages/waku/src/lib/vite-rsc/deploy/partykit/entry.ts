import { Hono } from 'hono';
import { createHonoHandler } from '../../lib/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { INTERNAL_setAllEnv } from '../../../../server.js';

function createApp(app: Hono) {
  app.use(createHonoHandler());
  app.notFound(async (c) => {
    const assetsFetcher = (c.env as any).ASSETS;
    const url = new URL(c.req.raw.url);
    const errorHtmlUrl = url.origin + '/404.html';
    const notFoundStaticAssetResponse = await assetsFetcher.fetch(
      new URL(errorHtmlUrl),
    );
    if (
      notFoundStaticAssetResponse &&
      notFoundStaticAssetResponse.status < 400
    ) {
      return c.body(notFoundStaticAssetResponse.body, 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

let app: Hono | undefined;

export default {
  async onFetch(request: Request, env: any, ctx: any) {
    if (!app) {
      INTERNAL_setAllEnv(env);
      app = honoEnhancer(createApp)(new Hono());
    }
    return app.fetch(request, env, ctx);
  },
};

export { handleBuild } from '../../lib/build.js';
