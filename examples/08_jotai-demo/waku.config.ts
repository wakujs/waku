import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    optimizeDeps: {
      // technically false-positive warning but it ensures a safe behavior
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['waku-jotai'],
    },
  },
});
