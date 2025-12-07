import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        resolve: {
          // Prevent Emotion from being bundled in RSC (uses createContext)
          external: ['@emotion/react', '@emotion/styled', '@emotion/cache'],
        },
      },
    },
  },
});
