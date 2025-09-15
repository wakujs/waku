import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import path from 'node:path';
import fs from 'node:fs';
import { DIST_PUBLIC } from '../../../builder/constants.js';
import { createApp as defaultCreateApp } from '../../../hono/engine.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
INTERNAL_setAllEnv(process.env as any);
createApp({ processRequest, config, isBuild }, app);
app.notFound((c) => {
  const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
  if (fs.existsSync(file)) {
    return c.html(fs.readFileSync(file, 'utf8'), 404);
  }
  return c.text('404 Not Found', 404);
});

export default getRequestListener(app.fetch);

export { processBuild } from '../../build.js';
