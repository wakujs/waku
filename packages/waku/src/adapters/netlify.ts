import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_constants as constants,
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export const netlifyAdapter = createServerEntryAdapter(
  (
    { processRequest, processBuild, setAllEnv, config },
    options?: {
      static?: boolean;
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
    setAllEnv(process.env as any);
    const app = new Hono();
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.notFound((c) => {
      const notFoundHtml = (globalThis as any).__WAKU_NOT_FOUND_HTML__;
      if (typeof notFoundHtml === 'string') {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: () =>
        buildNetlify({ ...config, serverless: !options?.static }),
    };
  },
);

async function buildNetlify({
  distDir,
  privateDir,
  serverless,
}: {
  distDir: string;
  privateDir: string;
  serverless: boolean;
}) {
  const publicDir = path.resolve(distDir, DIST_PUBLIC);

  if (serverless) {
    const functionsDir = path.resolve('netlify-functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    const notFoundFile = path.join(publicDir, '404.html');
    const notFoundHtml = existsSync(notFoundFile)
      ? readFileSync(notFoundFile, 'utf8')
      : null;
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `\
globalThis.__WAKU_NOT_FOUND_HTML__ = ${JSON.stringify(notFoundHtml)};
import { serverEntry } from '../${distDir}/server/index.js';
export default async (request, context) => serverEntry.fetch(request, { context });
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
    );
  }
  const netlifyTomlFile = path.resolve('netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `\
[build]
  command = "npm run build"
  publish = "${distDir}/${DIST_PUBLIC}"
[functions]
  included_files = ["${privateDir}/**"]
  directory = "netlify-functions"
`,
    );
  }
}
