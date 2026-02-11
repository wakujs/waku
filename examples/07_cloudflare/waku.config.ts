import fs from 'node:fs';
import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'waku/config';
import type { VitePlugin } from 'waku/config';

function prepareCloudflare(): VitePlugin {
  return {
    name: 'prepareCloudflare',
    enforce: 'pre',
    config(config) {
      const root = config.root ? path.resolve(config.root) : process.cwd();
      const mainEntry = './dist/server/index.js';
      const mainEntryAbs = path.resolve(root, mainEntry);
      if (
        !fs.existsSync(path.join(root, 'wrangler.toml')) &&
        !fs.existsSync(path.join(root, 'wrangler.json')) &&
        !fs.existsSync(path.join(root, 'wrangler.jsonc'))
      ) {
        let projectName = 'waku-project';
        try {
          const pkg = JSON.parse(
            fs.readFileSync(path.resolve(root, 'package.json'), 'utf-8'),
          );
          if (pkg.name && typeof pkg.name === 'string') {
            projectName = pkg.name;
          }
        } catch {
          // Fall back to default
        }
        fs.writeFileSync(
          path.join(root, 'wrangler.jsonc'),
          `\
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": ${JSON.stringify(projectName)},
  "main": ${JSON.stringify(mainEntry)},
  // nodejs_als is required for Waku server-side request context
  // It can be removed if only building static pages
  "compatibility_flags": ["nodejs_als"],
  // https://developers.cloudflare.com/workers/platform/compatibility-dates
  "compatibility_date": "2025-11-17",
  "assets": {
    // https://developers.cloudflare.com/workers/static-assets/binding/
    "binding": "ASSETS",
    "directory": "./dist/public",
    "html_handling": "drop-trailing-slash"
  },
  "rules": [
    {
      "type": "ESModule",
      "globs": ["**/*.js", "**/*.mjs"],
    },
  ],
  "no_bundle": true,
}
`,
        );
      }
      // Placeholder so @cloudflare/vite-plugin's main validation passes.
      // The real file is produced by the Vite build.
      if (!fs.existsSync(mainEntryAbs)) {
        fs.mkdirSync(path.dirname(mainEntryAbs), { recursive: true });
        fs.writeFileSync(mainEntryAbs, 'export default {};\n');
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
