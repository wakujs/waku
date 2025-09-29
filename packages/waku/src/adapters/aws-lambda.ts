import path from 'node:path';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import * as honoAwsLambda from 'hono/aws-lambda';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_constants as constants,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export const awsLambdaAdapter = createServerEntryAdapter(
  (
    { processRequest, processBuild, setAllEnv, config, isBuild },
    options?: {
      streaming?: boolean;
      middlewareFns?: (() => MiddlewareHandler)[];
      middlewareModules?: Record<
        string,
        () => Promise<{
          default: () => MiddlewareHandler;
        }>
      >;
    },
  ) => {
    const { middlewareFns = [], middlewareModules = {} } = options || {};
    setAllEnv(process.env as any);
    const app = new Hono();
    if (isBuild) {
      app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
    }
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.notFound((c) => {
      const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
      if (existsSync(file)) {
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      return c.text('404 Not Found', 404);
    });
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: () => buildAwsLambda({ ...config }),
      handler: options?.streaming
        ? honoAwsLambda.streamHandle(app)
        : honoAwsLambda.handle(app),
    };
  },
);

async function buildAwsLambda({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-aws-lambda.js';
  const serveCode = `
import { serverEntry } from './server/index.js';

export const handler = serverEntry.handler;
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
  writeFileSync(
    path.join(distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
}
