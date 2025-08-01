import type { Plugin } from 'vite';

import { SRC_CLIENT_ENTRY } from '../builder/constants.js';

export function rscIndexPlugin(opts: {
  basePath: string;
  srcDir: string;
  cssAssets?: string[];
}): Plugin {
  const indexHtml = 'index.html';
  const html = `
<!doctype html>
<html>
  <head>
  </head>
  <body>
    <script src="${opts.basePath}${opts.srcDir}/${SRC_CLIENT_ENTRY}" async type="module"></script>
  </body>
</html>
`;
  return {
    name: 'rsc-index-plugin',
    config() {
      return {
        optimizeDeps: {
          entries: [`${opts.srcDir}/${SRC_CLIENT_ENTRY}.*`],
        },
      };
    },
    options(options) {
      if (typeof options.input === 'string') {
        throw new Error('string input is unsupported');
      }
      if (Array.isArray(options.input)) {
        throw new Error('array input is unsupported');
      }
      return {
        ...options,
        input: {
          indexHtml,
          ...options.input,
        },
      };
    },
    configureServer(server) {
      return () => {
        server.middlewares.use((req, res, next) => {
          if (req.url === opts.basePath) {
            server
              .transformIndexHtml(req.url, html)
              .then((content) => {
                res.statusCode = 200;
                res.setHeader('content-type', 'text/html; charset=utf-8');
                res.end(content);
              })
              .catch((err) => {
                console.error('Error transforming index.html', err);
                res.statusCode = 500;
                res.end('Internal Server Error');
              });
          } else {
            next();
          }
        });
      };
    },
    resolveId(id) {
      if (id === indexHtml) {
        return { id: indexHtml, moduleSideEffects: true };
      }
    },
    load(id) {
      if (id === indexHtml) {
        return html;
      }
    },
    transformIndexHtml() {
      return [
        {
          tag: 'script',
          attrs: { type: 'module', async: true },
          // HACK: vite won't inject __vite__injectQuery anymore
          // Vite optimizes `import()` so it adds `?import` to imported urls. That'd cause double module hazard! This way, I hack it to use a global function so it does not get optimized.
          children: `
globalThis.__WAKU_CLIENT_IMPORT__ = (id) => import(id);
`,
        },
        ...(opts.cssAssets || []).map((href) => ({
          tag: 'link',
          attrs: { rel: 'stylesheet', href: `${opts.basePath}${href}` },
          injectTo: 'head' as const,
        })),
      ];
    },
  };
}
