import fs from 'node:fs';
import path from 'node:path';
import type { MiddlewareHandler } from 'hono';
import { DIST_PUBLIC } from '../../constants.js';
import type { Unstable_CreateAppArgs as CreateAppArgs } from '../../types.js';

export function notFoundMiddleware(args: CreateAppArgs): MiddlewareHandler {
  const { config } = args;
  return async (c) => {
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  };
}
