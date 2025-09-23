/// <reference types="vite/client" />

import { unstable_defineServer as defineServer } from 'waku/minimal/server';
import { unstable_fsRouter as fsRouter } from 'waku/router/server';

const router = fsRouter();

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
