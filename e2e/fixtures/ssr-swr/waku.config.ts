import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      ssr: {
        optimizeDeps: {
          include: ['swr'],
        },
      },
    },
  },
});
