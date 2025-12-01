// based on
// https://github.com/pawelblaszczyk5/vite-rsc-experiments/blob/4bc05095d9ec5dcb584af43a5704c4dceffd38b8/apps/stylex/vite.config.ts

import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

const babelConfig = {
  plugins: [
    ['@babel/plugin-syntax-jsx', {}],
    [
      '@stylexjs/babel-plugin',
      {
        treeshakeCompensation: true,
        unstable_moduleResolution: { type: 'commonJS' },
      },
    ],
  ],
  presets: ['@babel/preset-typescript'],
};

export default defineConfig({
  vite: {
    plugins: [react({ babel: babelConfig })],
  },
});
