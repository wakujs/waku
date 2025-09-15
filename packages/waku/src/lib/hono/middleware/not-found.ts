import path from 'node:path';
import fs from 'node:fs';
import type { MiddlewareHandler } from 'hono';
import type { Unstable_CreateFetchArgs as CreateFetchArgs } from '../../types.js';
import { DIST_PUBLIC } from '../../builder/constants.js';

export default function notFoundMiddleware(
  args: CreateFetchArgs,
): MiddlewareHandler {
  const { config } = args;
  return async (c) => {
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  };
}
