import path from 'node:path';
import { rmSync, cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

export default async function postBuild({
  distDir,
  rscBase,
  privateDir,
  basePath,
  DIST_PUBLIC,
  DIST_ASSETS,
  serverless,
}: {
  distDir: string;
  rscBase: string;
  privateDir: string;
  basePath: string;
  DIST_PUBLIC: string;
  DIST_ASSETS: string;
  serverless: boolean;
}) {
  const SERVE_JS = 'serve-vercel.js';
  const serveCode = `
import { serverEntry } from './server/index.js';

export default serverEntry.listener;
`;
  const publicDir = path.resolve(distDir, DIST_PUBLIC);
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (serverless) {
    // for serverless function
    // TODO(waku): can use `@vercel/nft` to packaging with native dependencies
    const serverlessDir = path.join(outputDir, 'functions', rscBase + '.func');
    rmSync(serverlessDir, { recursive: true, force: true });
    mkdirSync(path.join(serverlessDir, distDir), {
      recursive: true,
    });
    writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
    cpSync(path.resolve(distDir), path.join(serverlessDir, distDir), {
      recursive: true,
    });
    if (existsSync(path.resolve(privateDir))) {
      cpSync(path.resolve(privateDir), path.join(serverlessDir, privateDir), {
        recursive: true,
        dereference: true,
      });
    }
    const vcConfigJson = {
      runtime: 'nodejs22.x',
      handler: `${distDir}/${SERVE_JS}`,
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
  const routes = [
    {
      src: `^${basePath}${DIST_ASSETS}/(.*)$`,
      headers: {
        'cache-control': 'public, immutable, max-age=31536000',
      },
    },
    ...(serverless
      ? [
          { handle: 'filesystem' },
          {
            src: basePath + '(.*)',
            dest: basePath + rscBase + '/',
          },
        ]
      : []),
  ];
  const configJson = { version: 3, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
}
