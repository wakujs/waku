import path from 'node:path';
// FIXME hopefully we should avoid bundling this
import { Hono as HonoForDevAndBuild } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config },
    options?: {
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
    const {
      __WAKU_DENO_ADAPTER_HONO__: Hono = HonoForDevAndBuild,
      __WAKU_DENO_ADAPTER_SERVE_STATIC__: serveStatic,
      __WAKU_DENO_ADAPTER_NOT_FOUND_FN__: notFoundFn,
    } = globalThis as any;
    const app = new Hono();
    if (serveStatic) {
      app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
    }
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    if (notFoundFn) {
      app.notFound(notFoundFn);
    }
    const postBuildScript = path.posix.join(
      import.meta.__WAKU_ORIGINAL_PATH__,
      '../lib/deno-post-build.js',
    );
    const postBuildArg: Parameters<
      typeof import('./lib/deno-post-build.js').default
    >[0] = {
      distDir: config.distDir,
      DIST_PUBLIC,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: [postBuildScript, postBuildArg],
    };
  },
);
