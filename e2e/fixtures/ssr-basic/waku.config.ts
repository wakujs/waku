/// <reference types="waku/types" />

import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ['@ai-sdk/rsc'],
    },
  },
});
