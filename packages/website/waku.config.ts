import { defineConfig } from 'waku/config';
import { llmTextPlugin } from './src/lib/vite-plugin-llmstxt.js';

export default defineConfig({
  unstable_viteConfigs: {
    common: () => ({
      plugins: [llmTextPlugin()],
    }),
  },
});
