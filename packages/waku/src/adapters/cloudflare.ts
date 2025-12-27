import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';
import type { BuildOptions } from './cloudflare-build-enhancer.js';

const { DIST_PUBLIC } = constants;
const { rscMiddleware, middlewareRunner } = honoMiddleware;

function isWranglerDev(req: Request): boolean {
  // This header seems to only be set for production cloudflare workers
  return !req.headers.get('cf-visitor');
}

function removeGzipEncoding(res: Response): Response {
  const contentType = res.headers.get('content-type');
  if (
    !contentType ||
    contentType.includes('text/html') ||
    contentType.includes('text/plain')
  ) {
    const headers = new Headers(res.headers);
    headers.set('content-encoding', 'Identity');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
  return res;
}

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
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const buildOptions: BuildOptions = {
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
        let res: Response | Promise<Response>;
        if (cloudflareContext) {
          const { env, waitUntil, passThroughOnException } = cloudflareContext;
          res = app.fetch(req, env, {
            waitUntil,
            passThroughOnException,
            props: undefined,
          });
        } else {
          res = app.fetch(req);
        }
        // Workaround https://github.com/cloudflare/workers-sdk/issues/6577
        if (import.meta.env?.PROD && isWranglerDev(req)) {
          if ('then' in res) {
            res = res.then((res) => removeGzipEncoding(res));
          } else {
            res = removeGzipEncoding(res);
          }
        }
        return res;
      },
      build: processBuild,
      buildOptions,
      buildEnhancers: ['waku/adapters/cloudflare-build-enhancer'],
    };
  },
);
