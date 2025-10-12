import path from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import type { MiddlewareHandler } from 'hono';
import { DIST_PUBLIC } from '../../constants.js';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../../types.js';

export function staticMiddleware(args: CreateAppArgs): MiddlewareHandler {
  const { config, isBuild } = args;
  if (isBuild) {
    return serveStatic({
      root: path.join(config.distDir, DIST_PUBLIC),
      rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
    });
  }
  return (_c, next) => next();
}
