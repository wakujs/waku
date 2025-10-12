import fs from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import * as honoAwsLambda from 'hono/aws-lambda';
import { config } from 'virtual:vite-rsc-waku/config';
import { honoEnhancer } from 'virtual:vite-rsc-waku/hono-enhancer';
import { INTERNAL_setAllEnv } from '../../../../server.js';
import { DIST_PUBLIC } from '../../../constants.js';
import { createHonoHandler } from '../../engine.js';

function createApp(app: Hono) {
  INTERNAL_setAllEnv(process.env as any);
  app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
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

export const handler: any = import.meta.env.WAKU_AWS_LAMBDA_STREAMING
  ? honoAwsLambda.streamHandle(app)
  : honoAwsLambda.handle(app);
