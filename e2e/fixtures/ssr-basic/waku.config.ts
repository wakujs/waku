/// <reference types="vite/client" />

import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    // FIXME How can we limit this config for only mode=development?
    optimizeDeps: {
      exclude: ['@ai-sdk/rsc'],
    },
  },
});
