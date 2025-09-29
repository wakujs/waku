import path from 'node:path';
import {
  rmSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { Hono } from 'hono';
import { getRequestListener } from '@hono/node-server';
import type { MiddlewareHandler } from 'hono';
import {
  unstable_createServerEntry as createServerEntry,
  unstable_constants as constants,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

const { DIST_PUBLIC, DIST_ASSETS } = constants;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

export const vercelAdapter = createServerEntry(
  (
    { processRequest, processBuild, config },
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
    const app = new Hono();
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.notFound((c) => {
      const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
      if (existsSync(file)) {
        return c.html(readFileSync(file, 'utf8'), 404);
      }
      return c.text('404 Not Found', 404);
    });
    return {
      fetch: app.fetch,
      build: processBuild,
      postBuild: () => buildVercel({ ...config, serverless: !options?.static }),
      getRequestListener,
    };
  },
);

async function buildVercel({
  distDir,
  rscBase,
  privateDir,
  basePath,
  serverless,
}: {
  distDir: string;
  rscBase: string;
  privateDir: string;
  basePath: string;
  serverless: boolean;
}) {
  const SERVE_JS = 'serve-vercel.js';
  const serveCode = `
import { serverEntry, runFetch } from './server/index.js';

export default serverEntry.getRequestListener((req, ...args) =>
  runFetch(process.env, req, ...args));
`;
  const publicDir = path.resolve(distDir, DIST_PUBLIC);
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (serverless) {
    // for serverless function
    // TODO(waku): can use `@vercel/nft` to packaging with native dependencies
    const serverlessDir = path.join(outputDir, 'functions', rscBase + '.func');
    rmSync(serverlessDir, { recursive: true, force: true });
    mkdirSync(path.join(serverlessDir, distDir), {
      recursive: true,
    });
    writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
    cpSync(path.resolve(distDir), path.join(serverlessDir, distDir), {
      recursive: true,
    });
    if (existsSync(path.resolve(privateDir))) {
      cpSync(path.resolve(privateDir), path.join(serverlessDir, privateDir), {
        recursive: true,
        dereference: true,
      });
    }
    const vcConfigJson = {
      runtime: 'nodejs22.x',
      handler: `${distDir}/${SERVE_JS}`,
      launcherType: 'Nodejs',
    };
    writeFileSync(
      path.join(serverlessDir, '.vc-config.json'),
      JSON.stringify(vcConfigJson, null, 2),
    );
    writeFileSync(
      path.join(serverlessDir, 'package.json'),
      JSON.stringify({ type: 'module' }, null, 2),
    );
  }
  const routes = [
    {
      src: `^${basePath}${DIST_ASSETS}/(.*)$`,
      headers: {
        'cache-control': 'public, immutable, max-age=31536000',
      },
    },
    ...(serverless
      ? [
          { handle: 'filesystem' },
          {
            src: basePath + '(.*)',
            dest: basePath + rscBase + '/',
          },
        ]
      : []),
  ];
  const configJson = { version: 3, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
}
