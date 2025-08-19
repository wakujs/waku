import {
  type EnvironmentOptions,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import type { Config } from '../../../config.js';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  existsSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DIST_PUBLIC } from '../../../lib/builder/constants.js';

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

      // avoid `node` platform on rolldown
      // https://github.com/vitejs/rolldown-vite/issues/256#issuecomment-2969442015
      if ('rolldownVersion' in this.meta) {
        serverOptions.build = {
          rollupOptions: {
            platform: 'neutral',
          } as any,
        };
      }

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
    buildApp: {
      order: 'post',
      async handler(builder) {
        await build({
          config: builder.config,
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

function copyFiles(
  srcDir: string,
  destDir: string,
  extensions: readonly string[],
) {
  const files = readdirSync(srcDir, { withFileTypes: true });
  for (const file of files) {
    const srcPath = path.join(srcDir, file.name);
    const destPath = path.join(destDir, file.name);
    if (file.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyFiles(srcPath, destPath, extensions);
    } else if (extensions.some((ext) => file.name.endsWith(ext))) {
      copyFileSync(srcPath, destPath);
    }
  }
}

function copyDirectory(srcDir: string, destDir: string) {
  const files = readdirSync(srcDir, { withFileTypes: true });
  for (const file of files) {
    const srcPath = path.join(srcDir, file.name);
    const destPath = path.join(destDir, file.name);
    if (file.isDirectory()) {
      mkdirSync(destPath, { recursive: true });
      copyDirectory(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

function separatePublicAssetsFromFunctions({
  outDir,
  functionDir,
  assetsDir,
}: {
  outDir: string;
  functionDir: string;
  assetsDir: string;
}) {
  const tempDist = path.join(
    os.tmpdir(),
    `dist_${randomBytes(16).toString('hex')}`,
  );
  const tempPublicDir = path.join(tempDist, DIST_PUBLIC);
  const workerPublicDir = path.join(functionDir, DIST_PUBLIC);

  // Create a temp dir to prepare the separated files
  rmSync(tempDist, { recursive: true, force: true });
  mkdirSync(tempDist, { recursive: true });

  // Move the current dist dir to the temp dir
  // Folders are copied instead of moved to avoid issues on Windows
  copyDirectory(outDir, tempDist);
  rmSync(outDir, { recursive: true, force: true });

  // Create empty directories at the desired deploy locations
  // for the function and the assets
  mkdirSync(functionDir, { recursive: true });
  mkdirSync(assetsDir, { recursive: true });

  // Move tempDist/public to assetsDir
  copyDirectory(tempPublicDir, assetsDir);
  rmSync(tempPublicDir, { recursive: true, force: true });

  // Move tempDist to functionDir
  copyDirectory(tempDist, functionDir);
  rmSync(tempDist, { recursive: true, force: true });

  // Traverse assetsDir and copy specific files to functionDir/public
  mkdirSync(workerPublicDir, { recursive: true });
  copyFiles(assetsDir, workerPublicDir, [
    '.txt',
    '.html',
    '.json',
    '.js',
    '.css',
  ]);
}
