import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { DIST_PUBLIC } from '../../constants.js';
import { getConfig, getIsBuild } from '../../vite-rsc/handler.js';

export default function staticMiddleware(): MiddlewareHandler {
  const config = getConfig();
  const isBuild = getIsBuild();
  if (isBuild) {
    return serveStatic({
      root: path.join(config.distDir, DIST_PUBLIC),
      rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
    });
  }
  return (_c, next) => next();
}
