import path from 'node:path';
import fs from 'node:fs';
import type { MiddlewareHandler } from 'hono';
import { DIST_PUBLIC } from '../../constants.js';

export function notFoundMiddleware({
  distDir,
}: {
  distDir: string;
}): MiddlewareHandler {
  return async (c) => {
    const file = path.join(distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  };
}
