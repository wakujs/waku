import { Hono } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { createApp as defaultCreateApp } from '../../../hono/engine.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
INTERNAL_setAllEnv(process.env as any);
createApp({ processRequest, config, isBuild }, app);
app.notFound((c) => {
  const notFoundHtml = (globalThis as any).__WAKU_NOT_FOUND_HTML__;
  if (typeof notFoundHtml === 'string') {
    return c.html(notFoundHtml, 404);
  }
  return c.text('404 Not Found', 404);
});

export default async (request: Request, context: unknown) =>
  app.fetch(request, { context });

export { processBuild } from '../../build.js';
