import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_honoEnhancer: './waku.hono-enhancer',
  middleware: ['./waku.cloudflare-middleware'],
  vite: {
    optimizeDeps: {
      exclude: ['sqlite'],
    },
  },
});
