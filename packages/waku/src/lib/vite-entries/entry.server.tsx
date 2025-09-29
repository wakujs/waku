import { Hono } from 'hono';
import { createHonoHandler } from '../vite-rsc/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { flags, config, isBuild } from 'virtual:vite-rsc-waku/config';
import { compress } from 'hono/compress';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import { DIST_PUBLIC } from '../constants.js';
import { INTERNAL_setAllEnv } from '../../server.js';
import notFountHtml from 'virtual:vite-rsc-waku/404';

function createApp(app: Hono) {
  INTERNAL_setAllEnv(process.env as any);
  if (flags['experimental-compress']) {
    app.use(compress());
  }
  if (isBuild) {
    const root = path.join(config.distDir, DIST_PUBLIC);
    if (config.basePath !== '/') {
      // handle `/(base)/(request)` as `./dist/public/(request)`
      app.use(
        `${config.basePath}*`,
        serveStatic({
          root,
          rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
        }),
      );
    } else {
      app.use(serveStatic({ root }));
    }
  }
  app.use(createHonoHandler());
  app.notFound((c) => {
    if (notFountHtml) {
      return c.html(notFountHtml, 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

const app = honoEnhancer(createApp)(new Hono());

export default app.fetch;
