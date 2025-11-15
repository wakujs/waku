import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      client: {
        build: { emptyOutDir: false },
      },
    },
  },
});
