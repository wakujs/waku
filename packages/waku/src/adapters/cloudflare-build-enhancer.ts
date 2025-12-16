import fs from 'node:fs';
import path from 'node:path';

export type BuildOptions = { distDir: string };

async function postBuild({ distDir }: BuildOptions) {
  const mainEntry = path.resolve(
    path.join(distDir, 'server', 'serve-cloudflare.js'),
  );
  fs.writeFileSync(
    mainEntry,
    `\
import { INTERNAL_runFetch } from './index.js';

export default {
  fetch: (request, env, ctx) => INTERNAL_runFetch(env, request, env, ctx),
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
  "main": ${JSON.stringify(forceRelativePath(path.relative(process.cwd(), mainEntry)))},
  // https://developers.cloudflare.com/workers/platform/compatibility-dates
  "compatibility_date": "2024-11-11",
  // nodejs_als is required for Waku server-side request context
  // It can be removed if only building static pages
  "compatibility_flags": ["nodejs_als"],
  // https://developers.cloudflare.com/workers/static-assets/binding/
  "assets": {
    "binding": "ASSETS",
    "directory": "./dist/public",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
`,
    );
  }
}

export default async function buildEnhancer(
  build: (emitFile: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (emitFile: unknown, options: BuildOptions) => {
    await build(emitFile, options);
    await postBuild(options);
  };
}

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);
