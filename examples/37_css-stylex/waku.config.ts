// based on
// https://github.com/pawelblaszczyk5/vite-rsc-experiments/blob/4bc05095d9ec5dcb584af43a5704c4dceffd38b8/apps/stylex/vite.config.ts

import stylex from '@stylexjs/unplugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [
      stylex({
        debug: process.env.NODE_ENV === 'development',
        treeshakeCompensation: true,
        useCSSLayers: true,
        devMode: 'css-only',
        runtimeInjection: false,
      }),
      react(),
    ],
  },
});
