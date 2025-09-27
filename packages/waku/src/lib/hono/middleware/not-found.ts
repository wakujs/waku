import path from 'node:path';
import fs from 'node:fs';
import type { MiddlewareHandler } from 'hono';
import { DIST_PUBLIC } from '../../constants.js';
import { getConfig } from '../../vite-rsc/handler.js';

export default function notFoundMiddleware(): MiddlewareHandler {
  const config = getConfig();
  return async (c) => {
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  };
}
