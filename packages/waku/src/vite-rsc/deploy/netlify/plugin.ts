import { type Plugin, type ResolvedConfig } from 'vite';
import type { Config } from '../../../config.js';
import path from 'node:path';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { DIST_PUBLIC } from '../../../lib/builder/constants.js';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');

export function wakuDeployNetlifyPlugin(deployOptions: {
  wakuConfig: Required<Config>;
  serverless: boolean;
}): Plugin {
  return {
    name: 'waku:deploy-netlify',
    config() {
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
          },
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
          opts: deployOptions.wakuConfig,
          serverless: deployOptions.serverless,
        });
      },
    },
  };
}

async function build({
  config,
  opts,
  serverless,
}: {
  config: ResolvedConfig;
  opts: Required<Config>;
  serverless: boolean;
}) {
  const rootDir = config.root;
  const publicDir = config.environments.client!.build.outDir;

  if (serverless) {
    const functionsDir = path.join(rootDir, 'netlify-functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    const notFoundFile = path.join(publicDir, '404.html');
    const notFoundHtml = existsSync(notFoundFile)
      ? readFileSync(notFoundFile, 'utf8')
      : null;
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `\
globalThis.__WAKU_NOT_FOUND_HTML__ = ${JSON.stringify(notFoundHtml)};
export { default } from '../${opts.distDir}/rsc/index.js';
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
    );
  }
  const netlifyTomlFile = path.join(rootDir, 'netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `\
[build]
  command = "npm run build -- --with-netlify"
  publish = "${opts.distDir}/${DIST_PUBLIC}"
[functions]
  included_files = ["${opts.privateDir}/**"]
  directory = "netlify-functions"
`,
    );
  }
}
