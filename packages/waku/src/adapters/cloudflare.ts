import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';
import { joinPath as joinPathOrig } from '../lib/utils/path.js';

declare global {
  interface ImportMeta {
    readonly __WAKU_ORIGINAL_PATH__: string;
  }
}

function joinPath(path1: string, path2: string) {
  const p = joinPathOrig(path1, path2);
  return p.startsWith('/') ? p : './' + p;
}

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
    const app = new Hono();
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.notFound(async (c) => {
      const assetsFetcher = (c.env as any).ASSETS;
      const url = new URL(c.req.raw.url);
      const errorHtmlUrl = url.origin + '/404.html';
      const notFoundStaticAssetResponse = await assetsFetcher.fetch(
        new URL(errorHtmlUrl),
      );
      if (
        notFoundStaticAssetResponse &&
        notFoundStaticAssetResponse.status < 400
      ) {
        return c.body(notFoundStaticAssetResponse.body, 404);
      }
      return c.text('404 Not Found', 404);
    });
    const postBuildScript = joinPath(
      import.meta.__WAKU_ORIGINAL_PATH__,
      '../lib/cloudflare-post-build.js',
    );
    const postBuildArg: Parameters<
      typeof import('./lib/cloudflare-post-build.js').default
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
