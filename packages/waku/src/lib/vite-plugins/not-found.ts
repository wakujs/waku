import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { DIST_PUBLIC } from '../constants.js';

export function notFoundPlugin(): Plugin {
  // This provides raw html `public/404.html` for SSR fallback.
  // It's not used when router has 404 page.
  const name = 'virtual:vite-rsc-waku/not-found';
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
        return `export { default } from ${JSON.stringify(notFoundHtmlPath + '?raw')}`;
      }
    },
  };
}
