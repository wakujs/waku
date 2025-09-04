import { defineConfig } from 'waku/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  unstable_honoEnhancer: './waku.hono-enhancer',
  middleware: [
    'waku/middleware/context',
    'waku/middleware/dev-server',
    './waku.cloudflare-middleware',
    'waku/middleware/handler',
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['sqlite'],
    },
  },
});
