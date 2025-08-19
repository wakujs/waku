import { type Plugin, type ResolvedConfig } from 'vite';
import path from 'node:path';
import { rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import type { Config } from '../../../../config.js';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'entry.js');
const SERVE_JS = 'serve-vercel.js';

export function deployVercelPlugin(deployOptions: {
  config: Required<Config>;
  serverless: boolean;
}): Plugin {
  return {
    name: 'waku:deploy-vercel',
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
    buildApp: {
      order: 'post',
      async handler(builder) {
        await build({
          config: builder.config,
          opts: deployOptions.config,
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
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (serverless) {
    // for serverless function
    // TODO(waku): can use `@vercel/nft` to packaging with native dependencies
    const serverlessDir = path.join(
      outputDir,
      'functions',
      opts.rscBase + '.func',
    );
    rmSync(serverlessDir, { recursive: true, force: true });
    mkdirSync(path.join(serverlessDir, opts.distDir), {
      recursive: true,
    });
    writeFileSync(
      path.join(rootDir, opts.distDir, SERVE_JS),
      `export { default } from './rsc/index.js';\n`,
    );
    cpSync(
      path.join(rootDir, opts.distDir),
      path.join(serverlessDir, opts.distDir),
      { recursive: true },
    );
    if (existsSync(path.join(rootDir, opts.privateDir))) {
      cpSync(
        path.join(rootDir, opts.privateDir),
        path.join(serverlessDir, opts.privateDir),
        { recursive: true, dereference: true },
      );
    }
    const vcConfigJson = {
      runtime: 'nodejs22.x',
      handler: `${opts.distDir}/${SERVE_JS}`,
      launcherType: 'Nodejs',
    };
    writeFileSync(
      path.join(serverlessDir, '.vc-config.json'),
      JSON.stringify(vcConfigJson, null, 2),
    );
    writeFileSync(
      path.join(serverlessDir, 'package.json'),
      JSON.stringify({ type: 'module' }, null, 2),
    );
  }

  const routes = serverless
    ? [
        { handle: 'filesystem' },
        {
          src: opts.basePath + '(.*)',
          dest: opts.basePath + opts.rscBase + '/',
        },
      ]
    : undefined;
  const configJson = { version: 3, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
}
