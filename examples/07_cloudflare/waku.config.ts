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
          '{ "main": "./dist/server/index.js", "compatibility_flags": ["nodejs_als"] }',
        );
      }
      const mainEntryAbs = path.join(root, 'dist/server/index.js');
      if (!fs.existsSync(mainEntryAbs)) {
        fs.mkdirSync(path.dirname(mainEntryAbs), { recursive: true });
        fs.writeFileSync(mainEntryAbs, 'export default {};');
      }
    },
  };
}

export default defineConfig({
  vite: {
    environments: {
      rsc: {
        build: {
          rollupOptions: {
            platform: 'neutral',
          } as never,
        },
      },
      ssr: {
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
        viteEnvironment: { name: 'rsc' },
        inspectorPort: false,
      }),
    ],
  },
});
