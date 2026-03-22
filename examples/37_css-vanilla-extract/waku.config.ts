import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    plugins: [vanillaExtractPlugin()],
  },
});
