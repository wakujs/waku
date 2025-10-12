import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import * as honoAwsLambda from 'hono/aws-lambda';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
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
    const postBuildArg: Parameters<
      typeof import('./aws-lambda-post-build.js').default
    >[0] = {
      distDir: config.distDir,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: ['waku/adapters/aws-lambda-post-build', postBuildArg],
      handler: options?.streaming
        ? honoAwsLambda.streamHandle(app)
        : honoAwsLambda.handle(app),
    };
  },
);
