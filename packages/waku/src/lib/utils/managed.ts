import type { Config } from '../../config.js';
import type { unstable_fsRouter } from '../../router/fs-router.js';
import { EXTENSIONS } from '../builder/constants.js';

export const getManagedServerEntry = (config: Required<Config>) => {
  const globBase = `/${config.srcDir}/${config.pagesDir}/`;
  const globPattern = `${globBase}**/*.{${EXTENSIONS.map((ext) => ext.slice(1)).join(',')}}`;
  const fsRouterOptions: Parameters<typeof unstable_fsRouter>[1] = {
    apiDir: config.apiDir,
    slicesDir: config.slicesDir,
  };
  return `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
const glob = import.meta.glob(${JSON.stringify(globPattern)}, { base: ${JSON.stringify(globBase)} });
export default fsRouter(glob, ${JSON.stringify(fsRouterOptions)});
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
