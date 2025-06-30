import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    optimizeDeps: {
      include: ['react-error-boundary'],
    },
  },
});
