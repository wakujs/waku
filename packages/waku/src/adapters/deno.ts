import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { Hono as HonoForDevAndBuild } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;
const {
  __WAKU_DENO_ADAPTER_ENV__: denoEnv,
  __WAKU_DENO_ADAPTER_HONO__: Hono = HonoForDevAndBuild,
  __WAKU_DENO_ADAPTER_SERVE_STATIC__: serveStatic,
  __WAKU_DENO_ADAPTER_NOT_FOUND_FN__: notFoundFn,
} = globalThis as any;

export const denoAdapter = createServerEntryAdapter(
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
    if (denoEnv) {
      setAllEnv(denoEnv);
    }
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
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: () => buildDeno({ ...config }),
    };
  },
);

async function buildDeno({ distDir }: { distDir: string }) {
  const SERVE_JS = 'serve-deno.js';
  const serveCode = `
import { Hono } from 'jsr:@hono/hono';
import { serveStatic } from 'jsr:@hono/hono/deno';

globalThis.__WAKU_DENO_ADAPTER_ENV__ = Deno.env.toObject();
globalThis.__WAKU_DENO_ADAPTER_HONO__ = Hono;
globalThis.__WAKU_DENO_ADAPTER_SERVE_STATIC__ = serveStatic;
globalThis.__WAKU_DENO_ADAPTER_NOT_FOUND_FN__ = async (c) => {
  const file = ${JSON.stringify(distDir + '/' + DIST_PUBLIC + '/404.html')};
  try {
    const info = await Deno.stat(file);
    if (info.isFile) {
      c.header('Content-Type', 'text/html; charset=utf-8');
      return c.body(await Deno.readFile(file), 404);
    }
  } catch {}
  return c.text('404 Not Found', 404);
};

import { runFetch } from './server/index.js';

Deno.serve(runFetch);
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
}
