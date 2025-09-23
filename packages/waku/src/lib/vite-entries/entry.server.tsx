import { Hono } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { processRequest } from '../vite-rsc/handler.js';
import { INTERNAL_setAllEnv } from '../../server.js';
import { createApp as defaultCreateApp } from '../hono/engine.js';
import { staticMiddleware, notFoundMiddleware } from '../hono/middleware.js';

INTERNAL_setAllEnv(process.env as any);

const args = { processRequest, config, isBuild };
const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
if (config.basePath !== '/') {
  // handle `/(base)/(request)` as `./dist/public/(request)`
  app.use(`${config.basePath}*`, staticMiddleware(args));
} else {
  app.use(staticMiddleware(args));
}
const newApp = createApp(args, app);
app.use(notFoundMiddleware(args));

export const fetch = newApp.fetch;
