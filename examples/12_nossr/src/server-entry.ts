/// <reference types="vite/client" />

import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default adapter({
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
