import { defineConfig } from 'waku/config';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  vite: {
    plugins: [
      tailwindcss(),
      cloudflare({
        viteEnvironment: {
          name: 'rsc',
        },
      }),
    ],
    environments: {
      rsc: {
        optimizeDeps: {
          // TODO: known internal dependencies should be added by Waku?
          include: ['hono'],
        },
      },
    },
  },
});
