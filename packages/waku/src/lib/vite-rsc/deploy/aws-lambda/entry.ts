import { Hono } from 'hono';
import * as honoAwsLambda from 'hono/aws-lambda';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { DIST_PUBLIC } from '../../../builder/constants.js';
import type { Unstable_CreateApp as CreateApp } from '../../../types.js';
import { contextMiddleware, rscMiddleware } from '../../../hono/middleware.js';
import { processRequest } from '../../handler.js';
import { INTERNAL_setAllEnv } from '../../../../server.js';

const defaultCreateApp: CreateApp = (args, baseApp) => {
  const app = baseApp instanceof Hono ? (baseApp as Hono) : new Hono();
  app.use(contextMiddleware());
  app.use(rscMiddleware(args));
  return app;
};

const createApp = serverEntry.createApp || defaultCreateApp;

const app = new Hono();
INTERNAL_setAllEnv(process.env as any);
app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
createApp({ processRequest, config, isBuild }, app);
app.notFound((c) => {
  const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
  if (fs.existsSync(file)) {
    return c.html(fs.readFileSync(file, 'utf8'), 404);
  }
  return c.text('404 Not Found', 404);
});

export const handler: any = import.meta.env.WAKU_AWS_LAMBDA_STREAMING
  ? honoAwsLambda.streamHandle(app)
  : honoAwsLambda.handle(app);

export { processBuild } from '../../build.js';
