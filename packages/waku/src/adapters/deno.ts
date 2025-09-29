import path from 'node:path';
import { writeFileSync } from 'node:fs';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_createServerEntry as createServerEntry,
  unstable_constants as constants,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const DO_NOT_BUNDLE = '';
const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;
const {
  __WAKU_DENO_ADAPTER_HONO__: Hono = (await import(DO_NOT_BUNDLE + 'hono'))
    .Hono,
  __WAKU_DENO_ADAPTER_SERVE_STATIC__: serveStatic,
  __WAKU_DENO_ADAPTER_NOT_FOUND_FN__: notFoundFn,
} = globalThis as any;

export const denoAdapter = createServerEntry(
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

const env = Deno.env.toObject();

import { runFetch } from './server/index.js';

Deno.serve((req, ...args) => runFetch(env, req, ...args));
`;
  writeFileSync(path.join(distDir, SERVE_JS), serveCode);
}
