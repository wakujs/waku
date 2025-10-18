import { EXTENSIONS, SRC_PAGES } from '../constants.js';

export const getManagedServerEntry = (config: { srcDir: string }) => {
  const globBase = `/${config.srcDir}/${SRC_PAGES}`;
  const globPattern = `${globBase}/**/*.{${EXTENSIONS.map((ext) => ext.slice(1)).join(',')}}`;
  return `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  import.meta.glob(
    ${JSON.stringify(globPattern)},
    { base: ${JSON.stringify(globBase)} }
  )
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
