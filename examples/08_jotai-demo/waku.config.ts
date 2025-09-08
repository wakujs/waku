import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      // technically false-positive warning but it ensures a safe behavior
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['waku-jotai'],
    },
  },
});
