import { defineConfig } from 'vite';
import { vanillaExtractPlugin } from '@vanilla-extract/vite-plugin';

// FIXME we would like this to waku.config.ts using unstable_viteConfigs.
export default defineConfig({
  plugins: [vanillaExtractPlugin()],
});

// Known issues
// - client style FOUC on dev
