// based on
// https://github.com/pawelblaszczyk5/vite-rsc-experiments/blob/4bc05095d9ec5dcb584af43a5704c4dceffd38b8/apps/stylex/vite.config.ts

import { defineConfig } from 'waku/config';

// @ts-expect-error - untyped module
import stylexPlugin from '@stylexjs/postcss-plugin';
import react from '@vitejs/plugin-react';

const typedStylexPlugin = stylexPlugin as (options: {
  babelConfig?: unknown;
  cwd?: string;
  exclude?: Array<string>;
  include?: Array<string>;
  useCSSLayers?: boolean;
}) => never;

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
  unstable_viteConfigs: {
    common: () => ({
      css: {
        postcss: {
          plugins: [
            typedStylexPlugin({
              babelConfig: { babelrc: false, ...babelConfig },
              include: ['./src/**/*.{js,jsx,ts,tsx}'],
              useCSSLayers: true,
            }),
          ],
        },
      },
      plugins: [
        react({ babel: babelConfig }),
      ],
    }),
  },
});


// Known issues
// - server style HMR
