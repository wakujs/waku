import { type EnvironmentOptions, type Plugin } from 'vite';
import type { Config } from '../../../config.js';
import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { DIST_PUBLIC } from '../../../lib/builder/constants.js';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');
const SERVE_JS = 'serve-partykit.js';

export function wakuDeployPartykitPlugin(deployOptions: {
  wakuConfig: Required<Config>;
}): Plugin {
  return {
    name: 'waku:deploy-partykit',
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
        const config = this.environment.getTopLevelConfig();
        const opts = deployOptions.wakuConfig;
        const rootDir = config.root;

        writeFileSync(
          path.join(opts.distDir, SERVE_JS),
          `import './rsc/index.js';`,
        );

        const partykitJsonFile = path.join(rootDir, 'partykit.json');
        if (!existsSync(partykitJsonFile)) {
          writeFileSync(
            partykitJsonFile,
            JSON.stringify(
              {
                name: 'waku-project',
                main: `${opts.distDir}/${SERVE_JS}`,
                compatibilityDate: '2023-02-16',
                serve: `./${opts.distDir}/${DIST_PUBLIC}`,
              },
              null,
              2,
            ) + '\n',
          );
        }
      },
    },
  };
}
