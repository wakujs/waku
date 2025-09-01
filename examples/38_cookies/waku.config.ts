import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_honoEnhancer: './src/hono-enhancer',
  middleware: [
    'waku/middleware/context',
    './src/middleware/cookie.js',
    './src/middleware/noop.js',
    'waku/middleware/dev-server',
    'waku/middleware/handler',
  ],
});
