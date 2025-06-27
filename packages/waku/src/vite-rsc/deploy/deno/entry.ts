/* eslint-disable */
// @ts-nocheck

import { Hono } from 'jsr:@hono/hono';
import { serveStatic } from 'jsr:@hono/hono/deno';
import { createHonoHandler } from '../../entry.rsc.js';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { config } from 'virtual:vite-rsc-waku/config';
import path from 'node:path';
import fs from 'node:fs';
import { DIST_PUBLIC } from '../../../lib/builder/constants.js';

function createApp(app: Hono) {
  app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
  app.use(createHonoHandler());
  app.notFound(async (c) => {
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
  return app;
}

const app = honoEnhancer(createApp)(new Hono());

Deno.serve(app.fetch);
