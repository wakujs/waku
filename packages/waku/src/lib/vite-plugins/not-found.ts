import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { DIST_PUBLIC } from '../constants.js';

/**
 * Provides `public/404.html` to adapters as `notFoundHtml`.
 * @deprecated Will be removed in a future release. Add a `/404` page instead.
 */
export function notFoundPlugin(): Plugin {
  const name = 'virtual:vite-rsc-waku/not-found';
  let warned = false;
  return {
    name: 'waku:vite-plugins:not-found',
    resolveId(source, _importer, _options) {
      return source === name ? '\0' + name : undefined;
    },
    load(id) {
      if (id === '\0' + name) {
        const notFoundHtmlPath = path.resolve(DIST_PUBLIC, '404.html');
        if (!fs.existsSync(notFoundHtmlPath)) {
          return `export default undefined`;
        }
        if (!warned) {
          warned = true;
          this.warn(
            'Serving public/404.html for unhandled requests is deprecated. Add a /404 page instead.',
          );
        }
        return `export { default } from ${JSON.stringify(notFoundHtmlPath + '?raw')}`;
      }
    },
  };
}
