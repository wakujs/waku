import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      client: {
        optimizeDeps: {
          include: ['swr'],
        },
      },
      ssr: {
        optimizeDeps: {
          include: ['swr'],
        },
      },
    },
  },
});
