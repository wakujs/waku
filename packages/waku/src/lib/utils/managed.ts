import { EXTENSIONS, SRC_MIDDLEWARE, SRC_PAGES } from '../constants.js';

export const getManagedServerEntry = (srcDir: string) => {
  const globBase = `/${srcDir}/${SRC_PAGES}`;
  const exts = EXTENSIONS.map((ext) => ext.slice(1)).join(',');
  const globPattern = `${globBase}/**/*.{${exts}}`;
  const middlewareGlob = [`/${srcDir}/${SRC_MIDDLEWARE}/*.{${exts}}`, `!/${srcDir}/${SRC_MIDDLEWARE}/*.{test,spec}.{${exts}}`];
  return `
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

export default adapter(
  fsRouter(
    import.meta.glob(
      ${JSON.stringify(globPattern)},
      { base: ${JSON.stringify(globBase)} }
    )
  ),
  {
    middlewareModules: import.meta.glob(${JSON.stringify(middlewareGlob)}),
  },
);
`;
};

export const getManagedClientEntry = () => {
  return `
import { StrictMode, createElement } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from 'waku/router/client';

const rootElement = createElement(StrictMode, null, createElement(Router));

if (globalThis.__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
`;
};
