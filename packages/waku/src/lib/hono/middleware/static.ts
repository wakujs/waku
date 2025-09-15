import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { Unstable_CreateFetchArgs as CreateFetchArgs } from '../../types.js';
import { DIST_PUBLIC } from '../../builder/constants.js';

export default function staticMiddleware(
  args: CreateFetchArgs,
): MiddlewareHandler {
  const { config, isBuild } = args;
  if (isBuild) {
    return serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) });
  }
  return (_c, next) => next();
}
