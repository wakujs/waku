import { Hono } from 'hono';
import { createHonoHandler } from './lib/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { flags, config, isBuild } from 'virtual:vite-rsc-waku/config';
import { compress } from 'hono/compress';
import { contextStorage } from 'hono/context-storage';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { DIST_PUBLIC } from '../lib/builder/constants.js';
import { INTERNAL_setAllEnv } from '../server.js';

function createApp(app: Hono) {
  INTERNAL_setAllEnv(process.env as any);
  if (flags['experimental-compress']) {
    app.use(compress());
  }
  app.use(contextStorage());
  if (isBuild) {
    app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
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

export { handleBuild } from './lib/build.js';
