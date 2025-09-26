/// <reference types="waku/types" />

import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

const router = fsRouter(
  import.meta.glob('/src/pages/**/*.tsx', { base: '/src/pages' }),
  { apiDir: 'api', slicesDir: '_slices' },
);

export default defineServer({
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
