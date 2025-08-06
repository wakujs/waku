import { defineConfig } from 'waku/config';
import { llmTextPlugin } from './src/lib/vite-plugin-llmstxt.js';

export default defineConfig({
  vite: {
    plugins: [llmTextPlugin()],
    environments: {
      client: {
        optimizeDeps: {
          include: ['tailwindcss/colors'],
        },
      },
      rsc: {
        optimizeDeps: {
          include: ['next-mdx-remote/rsc'],
        },
      },
    },
  },
});
