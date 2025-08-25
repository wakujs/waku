import { defineConfig } from 'waku/config';
import { cloudflare } from '@cloudflare/vite-plugin';

export default defineConfig({
  vite: {
    plugins: [
      cloudflare({
        persistState: true,
        viteEnvironment: {
          name: 'rsc',
        },
      }),
    ],
    environments: {
      rsc: {
        optimizeDeps: {
          // TODO
          exclude: ['hono'],
        },
      },
    },
  },
});
