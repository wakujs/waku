import { Hono } from 'hono';
import { createHonoHandler } from '../../lib/engine.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { INTERNAL_setAllEnv } from '../../../server.js';

function createApp(app: Hono) {
  INTERNAL_setAllEnv(process.env as any);
  app.use(createHonoHandler());
  app.notFound((c) => {
    const notFoundHtml = (globalThis as any).__WAKU_NOT_FOUND_HTML__;
    if (typeof notFoundHtml === 'string') {
      return c.html(notFoundHtml, 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}

const app = honoEnhancer(createApp)(new Hono());

export default async (request: Request, context: unknown) =>
  app.fetch(request, { context });

export { handleBuild } from '../../lib/build.js';
