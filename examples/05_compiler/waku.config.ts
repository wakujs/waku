import { defineConfig } from 'waku/config';
import react from '@vitejs/plugin-react';

const ReactCompilerConfig = {};

export default defineConfig({
  vite: {
    plugins: [
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler', ReactCompilerConfig],
        },
      }),
    ],
  },
});
