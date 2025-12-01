import fs from 'node:fs';
import path from 'node:path';

export default async function postBuild({
  // TBD if we should use these
  // assetsDir,
  distDir,
  // rscBase,
  // privateDir,
  // basePath,
  DIST_PUBLIC,
  serverless,
}: {
  assetsDir: string;
  distDir: string;
  rscBase: string;
  privateDir: string;
  basePath: string;
  DIST_PUBLIC: string;
  serverless: boolean;
}) {
  const mainEntry = path.resolve(
    path.join(distDir, 'server', 'serve-cloudflare.js'),
  );
  fs.writeFileSync(
    mainEntry,
    `\
import { INTERNAL_runFetch } from './index.js';
import handlers from './platform.js';
export * from './platform.js';

export default {
  ...(handlers ? handlers : {}),
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
${
  serverless
    ? `"main": ${JSON.stringify(forceRelativePath(path.relative(process.cwd(), mainEntry)))},
`
    : ''
}. // https://developers.cloudflare.com/workers/platform/compatibility-dates
  "compatibility_date": "2025-11-17",
  // nodejs_als is required for Waku server-side request context
  // It can be removed if only building static pages
  "compatibility_flags": ["nodejs_als"],
  // https://developers.cloudflare.com/workers/static-assets/binding/
  "assets": {
    "binding": "ASSETS",
    "directory": "./${distDir}/${DIST_PUBLIC}",
    "html_handling": "drop-trailing-slash",
    "not_found_handling": "404-page"
  }
}
`,
    );
  }
}

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);
