import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export const cloudflareAdapter = createServerEntryAdapter(
  (
    { processRequest, processBuild, setAllEnv, config },
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
    const postBuildArg: Parameters<
      typeof import('./cloudflare-post-build.js').default
    >[0] = {
      distDir: config.distDir,
      DIST_PUBLIC,
    };
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: ['waku/adapters/cloudflare-post-build', postBuildArg],
      setAllEnv,
    };
  },
);
