import { defineConfig } from 'waku/config';

export default defineConfig({
  unstable_renderHtmlEnhancer: './src/server-html/ssr.ts',
});
