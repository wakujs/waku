import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    resolve: {
      tsconfigPaths: true,
    },
  },
});
