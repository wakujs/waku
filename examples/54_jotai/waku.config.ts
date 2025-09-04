import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    optimizeDeps: {
      exclude: ['waku-jotai'],
    },
  },
});
