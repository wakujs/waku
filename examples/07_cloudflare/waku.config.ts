import nodeLoaderCloudflare from '@hiogawa/node-loader-cloudflare/vite';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';

export default defineConfig({
  vite: {
    environments: {
        rsc: {
          build: {
            rollupOptions: {
              platform: 'neutral',
            },
          },
        },
        ssr: {
          build: {
            rollupOptions: {
              platform: 'neutral',
            },
          },
        },
    },
    plugins: [
      tailwindcss(),
      react({
        babel: {
          plugins: ['babel-plugin-react-compiler'],
        },
      }),
      nodeLoaderCloudflare({
        environments: ['rsc'],
        build: true,
        // https://developers.cloudflare.com/workers/wrangler/api/#getplatformproxy
        getPlatformProxyOptions: {
          persist: {
            path: '.wrangler/state/v3',
          },
        },
      }),
    ],
  },
});
