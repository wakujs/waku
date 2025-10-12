import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { compress } from 'hono/compress';
import { config, flags, isBuild } from 'virtual:vite-rsc-waku/config';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { INTERNAL_setAllEnv } from '../../server.js';
import { DIST_PUBLIC } from '../constants.js';
import { createHonoHandler } from '../vite-rsc/engine.js';

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
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

const app = honoEnhancer(createApp)(new Hono());

export default app.fetch;
