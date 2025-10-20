import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC, DIST_ASSETS } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export const vercelAdapter = createServerEntryAdapter(
  (
    { processRequest, processBuild, config },
    options?: {
      static?: boolean;
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
    const app = new Hono();
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
      typeof import('./vercel-post-build.js').default
    >[0] = {
      distDir: config.distDir,
      rscBase: config.rscBase,
      privateDir: config.privateDir,
      basePath: config.basePath,
      DIST_PUBLIC,
      DIST_ASSETS,
      serverless: !options?.static,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: ['waku/adapters/vercel-post-build', postBuildArg],
    };
  },
);
