import type { Config } from '../../config.js';
import { EXTENSIONS } from '../builder/constants.js';

export const getManagedServerEntry = (config: Required<Config>) => {
  const globBase = `/${config.srcDir}/pages`;
  const globPattern = `${globBase}/**/*.{${EXTENSIONS.map((ext) => ext.slice(1)).join(',')}}`;
  return `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

export default nodeAdapter(fsRouter(
  import.meta.glob(
    ${JSON.stringify(globPattern)},
    { base: ${JSON.stringify(globBase)} }
  )
));
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
