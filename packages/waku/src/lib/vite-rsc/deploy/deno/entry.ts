/* eslint-disable */

// @ts-expect-error deno
import { Hono } from 'jsr:@hono/hono';
// @ts-expect-error deno
import { serveStatic } from 'jsr:@hono/hono/deno';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import type { Unstable_CreateApp as CreateApp } from '../../../types.js';
import path from 'node:path';
import { DIST_PUBLIC } from '../../../builder/constants.js';
import { contextMiddleware, rscMiddleware } from '../../../hono/middleware.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

declare let Deno: any;

const defaultCreateApp: CreateApp = (args, baseApp) => {
  const app: Hono = (baseApp as unknown as Hono | undefined) || new Hono();
  app.use(contextMiddleware());
  app.use(rscMiddleware(args));
  return app as unknown as NonNullable<typeof baseApp>;
};

const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
INTERNAL_setAllEnv(Deno.env.toObject());
app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
createApp(
  {
    processRequest,
    config,
    isBuild,
    deployAdapter: 'deno',
  },
  app,
);
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
