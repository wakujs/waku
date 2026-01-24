import { Hono } from 'hono';
import type { MiddlewareHandler } from 'hono';
import type { ImportGlobFunction } from 'vite/types/importGlob.d.ts';
import {
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_honoMiddleware as honoMiddleware,
} from 'waku/internals';

declare global {
  interface ImportMeta {
    glob: ImportGlobFunction;
  }
}

const { contextMiddleware, nonceMiddleware, rscMiddleware, middlewareRunner } =
  honoMiddleware;

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, notFoundHtml },
    options?: {
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
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(nonceMiddleware());
    app.use(rscMiddleware({ processRequest }));
    return {
      fetch: app.fetch,
      build: processBuild,
    };
  },
);
