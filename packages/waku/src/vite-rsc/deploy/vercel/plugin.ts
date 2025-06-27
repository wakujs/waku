import { normalizePath, type Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

export function wakuDeployVercelPlugin(): Plugin {
  return {
    name: 'waku:deploy-vercel',
    config() {
      return {
        define: {
          'import.meta.env.WAKU_SERVE_STATIC': JSON.stringify(false),
        },
        environments: {
          rsc: {
            build: {
              rollupOptions: {
                input: {
                  vercel: 'waku/vite-rsc/deploy/vercel/entry.vercel',
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
        const config = this.environment.getTopLevelConfig();
        await buildVercel({
          clientDir: config.environments.client!.build.outDir,
          serverDir: config.environments.rsc!.build.outDir,
        });
      },
    },
  };
}

// copied from my own adapter for now
// https://github.com/hi-ogawa/rsc-movies/blob/8e350bf8328b67e94cffe95abd6a01881ecd937d/vite.config.ts#L48
async function buildVercel(options: { clientDir: string; serverDir: string }) {
  const adapterDir = './.vercel/output';
  fs.rmSync(adapterDir, { recursive: true, force: true });
  fs.mkdirSync(adapterDir, { recursive: true });
  fs.writeFileSync(
    path.join(adapterDir, 'config.json'),
    JSON.stringify(
      {
        version: 3,
        trailingSlash: false,
        routes: [
          {
            src: '^/assets/(.*)$',
            headers: {
              'cache-control': 'public, immutable, max-age=31536000',
            },
          },
          {
            handle: 'filesystem',
          },
          {
            src: '.*',
            dest: '/',
          },
        ],
        overrides: {},
      },
      null,
      2,
    ),
  );

  // static
  fs.mkdirSync(path.join(adapterDir, 'static'), { recursive: true });
  fs.cpSync(options.clientDir, path.join(adapterDir, 'static'), {
    recursive: true,
  });

  // function config
  const functionDir = path.join(adapterDir, 'functions/index.func');
  const serverEntry = path.join(options.serverDir, 'vercel.js');
  fs.mkdirSync(functionDir, {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(functionDir, '.vc-config.json'),
    JSON.stringify(
      {
        runtime: 'nodejs22.x',
        handler: normalizePath(path.relative(process.cwd(), serverEntry)),
        launcherType: 'Nodejs',
      },
      null,
      2,
    ),
  );

  // copy server entry and dependencies
  const { nodeFileTrace } = await import('@vercel/nft');
  const result = await nodeFileTrace([serverEntry]);
  for (const file of result.fileList) {
    const dest = path.join(functionDir, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    // preserve pnpm node_modules releative symlinks
    const stats = fs.lstatSync(file);
    if (stats.isSymbolicLink()) {
      const link = fs.readlinkSync(file);
      fs.symlinkSync(link, dest);
    } else {
      fs.copyFileSync(file, dest);
    }
  }
}
