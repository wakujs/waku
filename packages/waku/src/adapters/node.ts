import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import {
  contextMiddleware,
  rscMiddleware,
  staticMiddleware,
  notFoundMiddleware,
  middlewareRunner,
} from '../lib/hono/middleware.js';
import { createServerEntry, getConfig } from '../lib/vite-rsc/handler.js';

const config = getConfig();

export const nodeAdapter = createServerEntry(
  (
    { processRequest, processBuild },
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
    app.use(`${config.basePath}*`, staticMiddleware());
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.use(notFoundMiddleware());
    return {
      fetch: app.fetch,
      build: processBuild,
    };
  },
);
