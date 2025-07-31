import {
  type EnvironmentOptions,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import type { Config } from '../../../config.js';
import { separatePublicAssetsFromFunctions } from '../../../lib/plugins/vite-plugin-deploy-cloudflare.js';
import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');
const SERVE_JS = 'serve-cloudflare.js';

export function deployCloudflarePlugin(deployOptions: {
  config: Required<Config>;
}): Plugin {
  return {
    name: 'waku:deploy-cloudflare',
    config() {
      // configures environment like @cloudflare/vite-plugin
      // https://github.com/cloudflare/workers-sdk/blob/869b7551d719ccfe3843c25e9907b74024458561/packages/vite-plugin-cloudflare/src/cloudflare-environment.ts#L131
      const serverOptions: EnvironmentOptions = {
        resolve: {
          conditions: [
            'workerd',
            'module',
            'browser',
            'development|production',
          ],
        },
        keepProcessEnv: false,
      };

      return {
        environments: {
          rsc: {
            build: {
              rollupOptions: {
                input: {
                  index: SERVER_ENTRY,
                },
              },
            },
            ...serverOptions,
          },
          ssr: serverOptions,
        },
      };
    },
    writeBundle: {
      order: 'post',
      sequential: true,
      async handler() {
        if (this.environment.name !== 'ssr') {
          return;
        }
        await build({
          config: this.environment.getTopLevelConfig(),
          opts: deployOptions.config,
        });
      },
    },
  };
}

async function build({
  config,
  opts,
}: {
  config: ResolvedConfig;
  opts: Required<Config>;
}) {
  const rootDir = config.root;
  const outDir = path.join(rootDir, opts.distDir);
  const assetsDistDir = path.join(outDir, 'assets');
  const workerDistDir = path.join(outDir, 'worker');

  writeFileSync(
    path.join(outDir, SERVE_JS),
    `export { default } from './rsc/index.js';\n`,
  );

  separatePublicAssetsFromFunctions({
    outDir,
    assetsDir: assetsDistDir,
    functionDir: workerDistDir,
  });

  const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
  const wranglerJsonFile = path.join(rootDir, 'wrangler.json');
  const wranglerJsoncFile = path.join(rootDir, 'wrangler.jsonc');
  if (
    !existsSync(wranglerTomlFile) &&
    !existsSync(wranglerJsonFile) &&
    !existsSync(wranglerJsoncFile)
  ) {
    writeFileSync(
      wranglerJsoncFile,
      `\
{
  "name": "waku-project",
  "main": "./dist/worker/serve-cloudflare.js",
  // https://developers.cloudflare.com/workers/platform/compatibility-dates
  "compatibility_date": "2024-11-11",
  // nodejs_als is required for Waku server-side request context
  // It can be removed if only building static pages
  "compatibility_flags": ["nodejs_als"],
  // https://developers.cloudflare.com/workers/static-assets/binding/
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/assets",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
`,
    );
  }
}
