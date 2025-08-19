// Known issues
// - client style FOUC on dev

import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

// FIXME we would like this to waku.config.ts using vite.
export default defineConfig({
  plugins: [vanillaExtractPlugin()],
});
