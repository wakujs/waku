import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
    ],
    optimizeDeps: {
      // technically false-positive warning but it ensures a safe behavior
      // https://github.com/vitejs/vite-plugin-react/issues/759
      exclude: ['waku-jotai'],
    },
  },
});
