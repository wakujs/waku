import fs from 'node:fs';
import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';
import type { VitePlugin } from 'waku/config';

// FIXME Hope we could avoid this hack in the future
function prepareCloudflare(): VitePlugin {
  return {
    name: 'prepareCloudflare',
    enforce: 'pre',
    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      const wranglerPath = path.join(root, 'wrangler.jsonc');
      if (!fs.existsSync(wranglerPath)) {
        fs.writeFileSync(
          wranglerPath,
          '{ "main": "./src/waku.server", "compatibility_flags": ["nodejs_als"] }',
        );
      }
    },
  };
}

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        optimizeDeps: {
          include: ['hono/tiny'],
        },
        build: {
          rollupOptions: {
            platform: 'neutral',
          } as never,
        },
      },
      ssr: {
        optimizeDeps: {
          include: ['waku > rsc-html-stream/server'],
        },
        build: {
          rollupOptions: {
            platform: 'neutral',
          } as never,
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
      prepareCloudflare(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        inspectorPort: false,
      }),
    ],
  },
});
