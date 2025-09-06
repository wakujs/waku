import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_honoEnhancer: './src/hono-enhancer',
  middleware: ['./src/middleware/cookie.js', './src/middleware/noop.js'],
});
