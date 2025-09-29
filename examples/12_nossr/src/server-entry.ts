/// <reference types="vite/client" />

import { unstable_fsRouter as fsRouter } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default nodeAdapter({
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
