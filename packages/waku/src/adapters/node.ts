import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';

import {
  contextMiddleware,
  rscMiddleware,
  staticMiddleware,
  notFoundMiddleware,
} from '../lib/hono/middleware.js';
import { createServerEntry, getConfig } from '../lib/vite-rsc/handler.js';

const config = getConfig();

const runner = (
  middlewareModules: Record<
    string,
    () => Promise<{
      default: () => MiddlewareHandler;
    }>
  >,
): MiddlewareHandler => {
  let handlers: MiddlewareHandler[] | undefined;
  return async (c, next) => {
    if (!handlers) {
      handlers = await Promise.all(
        Object.values(middlewareModules).map((m) =>
          m().then((mod) => mod.default()),
        ),
      );
    }
    const run = async (index: number) => {
      await handlers![index]?.(c, () => run(index + 1));
    };
    await run(0);
    await next();
  };
};

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
    app.use(runner(middlewareModules));
    app.use(rscMiddleware({ processRequest }));
    app.use(notFoundMiddleware());
    return {
      fetch: app.fetch,
      build: processBuild,
    };
  },
);
