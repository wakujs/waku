import { Hono } from 'hono';

import {
  contextMiddleware,
  rscMiddleware,
  staticMiddleware,
  notFoundMiddleware,
} from '../lib/hono/middleware.js';
import { createServerEntry, getConfig } from '../lib/vite-rsc/handler.js';

const config = getConfig();

export default createServerEntry(({ processRequest, processBuild }) => {
  const app = new Hono();
  app.use(`${config.basePath}*`, staticMiddleware());
  app.use(contextMiddleware());
  app.use(rscMiddleware({ processRequest }));
  app.use(notFoundMiddleware());
  return {
    fetch: app.fetch,
    build: processBuild,
  };
});
