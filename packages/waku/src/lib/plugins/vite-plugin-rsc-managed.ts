import { EXTENSIONS } from '../builder/constants.js';
import { filePathToFileURL } from '../utils/path.js';

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export const getManagedEntries = (
  filePath: string,
  srcDir: string,
  options: { pagesDir: string; apiDir: string; slicesDir: string },
) => `
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

export default fsRouter(
  '${filePathToFileURL(filePath)}',
  (file) => import.meta.glob('/${srcDir}/pages/**/*.{${EXTENSIONS.map((ext) =>
    ext.replace(/^\./, ''),
  ).join(',')}}')[\`/${srcDir}/pages/\${file}\`]?.(),
  { pagesDir: '${options.pagesDir}', apiDir: '${options.apiDir}', slicesDir: '${options.slicesDir}' },
);
`;

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export const getManagedMain = () => `
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
