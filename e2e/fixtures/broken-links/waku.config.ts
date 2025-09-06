import { defineConfig } from 'waku/config';

export default defineConfig({
  middleware: ['./src/redirects.js'],
});
