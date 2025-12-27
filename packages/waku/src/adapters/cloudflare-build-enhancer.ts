import fs from 'node:fs';
import path from 'node:path';

export type BuildOptions = {
  assetsDir: string;
  distDir: string;
  rscBase: string;
  privateDir: string;
  basePath: string;
  DIST_PUBLIC: string;
  serverless: boolean;
};

async function postBuild({ distDir, DIST_PUBLIC, serverless }: BuildOptions) {
  const mainEntry = path.resolve(
    path.join(distDir, 'server', 'serve-cloudflare.js'),
  );
  fs.writeFileSync(
    mainEntry,
    `\
import { INTERNAL_runFetch, unstable_serverEntry as serverEntry } from './index.js';

export default {
  ...(serverEntry.handlers ? serverEntry.handlers : {}),
  fetch: (request, env, ...args) => INTERNAL_runFetch(env, request, env, ...args),
};
`,
  );

  const wranglerTomlFile = path.resolve('wrangler.toml');
  const wranglerJsonFile = path.resolve('wrangler.json');
  const wranglerJsoncFile = path.resolve('wrangler.jsonc');
  if (
    !fs.existsSync(wranglerTomlFile) &&
    !fs.existsSync(wranglerJsonFile) &&
    !fs.existsSync(wranglerJsoncFile)
  ) {
    fs.writeFileSync(
      wranglerJsoncFile,
      `\
{
  "name": "waku-project",
  ${
    serverless
      ? `"main": ${JSON.stringify(forceRelativePath(path.relative(process.cwd(), mainEntry)))},
  `
      : ''
  }// https://developers.cloudflare.com/workers/platform/compatibility-dates
  "compatibility_date": "2025-11-17",
  ${
    serverless
      ? `// nodejs_als is required for Waku server-side request context
  // It can be removed if only building static pages
  "compatibility_flags": ["nodejs_als"],
  // https://developers.cloudflare.com/workers/static-assets/binding/
  `
      : ''
  }"assets": {
    ${
      serverless
        ? `"binding": "ASSETS",
    `
        : ''
    }"directory": "./${distDir}/${DIST_PUBLIC}",
    "html_handling": "drop-trailing-slash"
  }
}
`,
    );
  }
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);
