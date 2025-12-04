import path from 'node:path';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from 'hono/bun';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
    readonly __WAKU_ORIGINAL_PATH__: string;
  }
}

function joinPath(path1: string, path2: string) {
  const p = path.posix.join(path1, path2);
  return p.startsWith('/') ? p : './' + p;
}

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, config, isBuild, notFoundHtml },
    options?: {
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
    if (isBuild) {
      app.use(
        `${config.basePath}*`,
        serveStatic({
          root: path.join(config.distDir, DIST_PUBLIC),
          rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
        }),
      );
    }
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const postBuildScript = joinPath(
      import.meta.__WAKU_ORIGINAL_PATH__,
      '../lib/bun-post-build.js',
    );
    const postBuildArg: Parameters<
      typeof import('./lib/bun-post-build.js').default
    >[0] = {
      distDir: config.distDir,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: [postBuildScript, postBuildArg],
    };
  },
);
