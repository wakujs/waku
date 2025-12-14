import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';
import { joinPath as joinPathOrig } from '../lib/utils/path.js';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
    readonly __WAKU_ORIGINAL_PATH__: string;
  }
}

function joinPath(path1: string, path2: string) {
  const p = joinPathOrig(path1, path2);
  return p.startsWith('/') ? p : './' + p;
}

const { DIST_PUBLIC } = constants;
const { rscMiddleware, middlewareRunner } = honoMiddleware;

function isWranglerDev(req: Request): boolean {
  // This header seems to only be set for production cloudflare workers
  return !req.headers.get('cf-visitor');
}

// Workaround https://github.com/cloudflare/workers-sdk/issues/6577
export const cloudflareMiddleware = (): MiddlewareHandler => {
  return async (c, next) => {
    await next();
    if (!import.meta.env?.PROD) {
      return;
    }
    if (!isWranglerDev(c.req.raw)) {
      return;
    }
    const contentType = c.res.headers.get('content-type');
    if (
      !contentType ||
      contentType.includes('text/html') ||
      contentType.includes('text/plain')
    ) {
      const headers = new Headers(c.res.headers);
      headers.set('content-encoding', 'Identity');
      c.res = new Response(c.res.body, {
        status: c.res.status,
        statusText: c.res.statusText,
        headers: c.res.headers,
      });
    }
  };
};

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
    app.use(cloudflareMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const postBuildScript = joinPath(
      import.meta.__WAKU_ORIGINAL_PATH__,
      '../lib/cloudflare-post-build.js',
    );
    const postBuildArg: Parameters<
      typeof import('./lib/cloudflare-post-build.js').default
    >[0] = {
      assetsDir: options?.assetsDir || 'assets',
      distDir: config.distDir,
      privateDir: config.privateDir,
      rscBase: config.rscBase,
      basePath: config.basePath,
      DIST_PUBLIC,
      serverless: !options?.static,
    };

    return {
      fetch: async (req: Request) => {
        let cloudflareContext;
        try {
          // @ts-expect-error - available when running in a Cloudflare environment
          // eslint-disable-next-line import/no-unresolved
          cloudflareContext = await import('cloudflare:workers');
        } catch {
          // Not in a Cloudflare environment
        }
        if (cloudflareContext) {
          const { env, waitUntil, passThroughOnException } = cloudflareContext;
          return app.fetch(req, env, {
            waitUntil,
            passThroughOnException,
            props: undefined,
          });
        }
        return app.fetch(req);
      },
      build: processBuild,
      postBuild: [postBuildScript, postBuildArg],
    };
  },
);
