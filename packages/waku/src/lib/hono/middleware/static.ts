import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../../types.js';
import { DIST_PUBLIC } from '../../constants.js';

export default function staticMiddleware(
  args: CreateAppArgs,
): MiddlewareHandler {
  const { config, isBuild } = args;
  if (isBuild) {
    return serveStatic({
      root: path.join(config.distDir, DIST_PUBLIC),
      rewriteRequestPath: (path) => path.slice(config.basePath.length - 1),
    });
  }
  return (_c, next) => next();
}
