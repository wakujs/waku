import path from 'node:path';
// FIXME hopefully we should avoid bundling this
import { Hono as HonoForDevAndBuild } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';
import type { BuildOptions } from './deno-build-enhancer.js';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config, notFoundHtml },
    options?: {
      middlewareFns?: (() => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
    },
  ) => {
    const { middlewareFns = [], middlewareModules = {} } = options || {};
    const {
      __WAKU_DENO_ADAPTER_HONO__: Hono = HonoForDevAndBuild,
      __WAKU_DENO_ADAPTER_SERVE_STATIC__: serveStatic,
    } = globalThis as any;
    const app = new Hono();
    app.notFound((c: any) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    if (serveStatic) {
      app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
    }
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const buildOptions: BuildOptions = {
      distDir: config.distDir,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      buildOptions,
      buildEnhancers: ['waku/adapters/deno-build-enhancer'],
    };
  },
);
