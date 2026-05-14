import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        optimizeDeps: { include: ['hono/tiny'] },
        build: { rolldownOptions: { platform: 'neutral' } },
      },
      ssr: {
        optimizeDeps: { include: ['waku > rsc-html-stream/server'] },
        build: { rolldownOptions: { platform: 'neutral' } },
      },
    },
    plugins: [
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        inspectorPort: false,
      }),
    ],
  },
});
