import { Hono } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { createApp as defaultCreateApp } from '../../../hono/engine.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

const createApp = serverEntry.createApp || defaultCreateApp;

function initializeApp() {
  const app = new Hono();
  createApp({ processRequest, config, isBuild }, app);
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
  fetch: (request: Request, env: any, ctx: any) => {
    if (!app) {
      INTERNAL_setAllEnv(env);
      app = initializeApp();
    }
    return app.fetch(request, env, ctx);
  },
};

export { processBuild } from '../../build.js';
