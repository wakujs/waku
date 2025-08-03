/// <reference types="vite/client" />

import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_viteConfigs: {
    'dev-main': () => ({
      optimizeDeps: {
        exclude: ['@ai-sdk/rsc'],
      },
    }),
  },
});
