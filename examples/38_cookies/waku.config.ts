import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: [
    'waku/middleware/context',
    './src/middleware/cookie.js',
    './src/middleware/noop.js',
    'waku/middleware/dev-server',
    'waku/middleware/handler',
  ],
});
