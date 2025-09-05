import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        resolve: {
          external: ['shiki'],
        },
      },
    },
  },
});
