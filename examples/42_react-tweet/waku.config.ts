import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['react-tweet'],
    },
  },
});
