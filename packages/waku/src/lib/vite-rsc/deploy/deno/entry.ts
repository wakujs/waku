/* eslint-disable */

// @ts-expect-error deno
import { Hono } from 'jsr:@hono/hono';
// @ts-expect-error deno
import { serveStatic } from 'jsr:@hono/hono/deno';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import path from 'node:path';
import { DIST_PUBLIC } from '../../../builder/constants.js';
import { rscMiddleware } from '../../../hono/middleware.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

declare let Deno: any;

const app = new Hono();
INTERNAL_setAllEnv(Deno.env.toObject());
app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
app.use(rscMiddleware({ processRequest, config, isBuild }));
app.notFound(async (c: any) => {
  const file = config.distDir + '/' + DIST_PUBLIC + '/404.html';
  try {
    const info = await Deno.stat(file);
    if (info.isFile) {
      c.header('Content-Type', 'text/html; charset=utf-8');
      return c.body(await Deno.readFile(file), 404);
    }
  } catch {}
  return c.text('404 Not Found', 404);
});

Deno.serve(app.fetch);
