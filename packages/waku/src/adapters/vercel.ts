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
import { DIST_PUBLIC, DIST_ASSETS } from '../lib/constants.js';

import {
  contextMiddleware,
  rscMiddleware,
  middlewareRunner,
} from '../lib/hono/middleware.js';
import { createServerEntry, getConfig } from '../lib/vite-rsc/handler.js';

const SERVE_JS = 'serve-vercel.js';
const config = getConfig();

export const vercelAdapter = createServerEntry(
  (
    { processRequest, processBuild },
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
      build: async () => {
        await processBuild();
        await build({ serverless: !options?.static });
      },
      listener: getRequestListener(app.fetch),
    };
  },
);

async function build({ serverless }: { serverless: boolean }) {
  const publicDir = path.resolve(config.distDir, DIST_PUBLIC);
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (serverless) {
    // for serverless function
    // TODO(waku): can use `@vercel/nft` to packaging with native dependencies
    const serverlessDir = path.join(
      outputDir,
      'functions',
      config.rscBase + '.func',
    );
    rmSync(serverlessDir, { recursive: true, force: true });
    mkdirSync(path.join(serverlessDir, config.distDir), {
      recursive: true,
    });
    writeFileSync(path.resolve(config.distDir, SERVE_JS), serveCode);
    cpSync(
      path.resolve(config.distDir),
      path.join(serverlessDir, config.distDir),
      { recursive: true },
    );
    if (existsSync(path.resolve(config.privateDir))) {
      cpSync(
        path.resolve(config.privateDir),
        path.join(serverlessDir, config.privateDir),
        { recursive: true, dereference: true },
      );
    }
    const vcConfigJson = {
      runtime: 'nodejs22.x',
      handler: `${config.distDir}/${SERVE_JS}`,
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
      src: `^${config.basePath}${DIST_ASSETS}/(.*)$`,
      headers: {
        'cache-control': 'public, immutable, max-age=31536000',
      },
    },
    ...(serverless
      ? [
          { handle: 'filesystem' },
          {
            src: config.basePath + '(.*)',
            dest: config.basePath + config.rscBase + '/',
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

const serveCode = `
import { serverEntry } from './server/index.js';

export default serverEntry.listener;
`;
