import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    optimizeDeps: {
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['react-tweet'],
    },
  },
});
