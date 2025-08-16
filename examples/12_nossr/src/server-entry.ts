/// <reference types="vite/client" />

import { unstable_defineEntries as defineEntries } from 'waku/minimal/server';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

const router = fsRouter(
  import.meta.url,
  (file) => import.meta.glob('./pages/**/*.tsx')[`./pages/${file}`]?.(),
  { pagesDir: 'pages', apiDir: 'api', slicesDir: '_slices' },
);

export default defineEntries({
  handleRequest: async (input, utils) => {
    if (input.type === 'custom') {
      return 'fallback'; // no ssr
    }
    return router.handleRequest(input, utils);
  },
  handleBuild: (utils) => {
    return router.handleBuild(utils);
  },
});
