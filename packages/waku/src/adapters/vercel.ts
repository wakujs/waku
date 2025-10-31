import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

declare global {
  interface ImportMeta {
    readonly __WAKU_ORIGINAL_PATH__: string;
  }
}

function joinPath(path1: string, path2: string) {
  const p = path.posix.join(path1, path2);
  return p.startsWith('/') ? p : './' + p;
}

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;
(global as any).__WAKU_HONO_NODE_SERVER_GET_REQUEST_LISTENER__ =
  getRequestListener;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config },
    options?: {
      static?: boolean;
      assetsDir?: string;
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
    const postBuildScript = joinPath(
      import.meta.__WAKU_ORIGINAL_PATH__,
      '../lib/vercel-post-build.js',
    );
    const postBuildArg: Parameters<
      typeof import('./lib/vercel-post-build.js').default
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
      postBuild: [postBuildScript, postBuildArg],
    };
  },
);
