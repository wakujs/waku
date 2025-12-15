import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;
(global as any).__WAKU_HONO_NODE_SERVER_GET_REQUEST_LISTENER__ =
  getRequestListener;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config, notFoundHtml },
    options?: {
      static?: boolean;
      assetsDir?: string;
      middlewareFns?: (() => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
    },
  ) => {
    const { middlewareFns = [], middlewareModules = {} } = options || {};
    const app = new Hono();
    app.notFound((c) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const postBuildArg: Parameters<
      typeof import('./vercel-post-build.js').default
    >[0] = {
      assetsDir: options?.assetsDir || 'assets',
      distDir: config.distDir,
      rscBase: config.rscBase,
      privateDir: config.privateDir,
      basePath: config.basePath,
      DIST_PUBLIC,
      serverless: !options?.static,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: ['waku/adapters/vercel-post-build', postBuildArg],
    };
  },
);
