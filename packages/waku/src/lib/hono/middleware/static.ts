import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { DIST_PUBLIC } from '../../constants.js';

export function staticMiddleware({
  distDir,
  basePath,
  isBuild,
}: {
  distDir: string;
  basePath: string;
  isBuild: boolean;
}): MiddlewareHandler {
  if (isBuild) {
    return serveStatic({
      root: path.join(distDir, DIST_PUBLIC),
      rewriteRequestPath: (path) => path.slice(basePath.length - 1),
    });
  }
  return (_c, next) => next();
}
