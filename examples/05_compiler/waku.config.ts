import { defineConfig } from 'waku/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const ReactCompilerConfig = {};

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler', ReactCompilerConfig],
        },
      }),
    ],
  },
});
