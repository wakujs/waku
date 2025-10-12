import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export default async function postBuild({
  distDir,
  privateDir,
  DIST_PUBLIC,
  serverless,
}: {
  distDir: string;
  privateDir: string;
  DIST_PUBLIC: string;
  serverless: boolean;
}) {
  const publicDir = path.resolve(distDir, DIST_PUBLIC);

  if (serverless) {
    const functionsDir = path.resolve('netlify-functions');
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
import { serverEntry } from '../${distDir}/server/index.js';
export default async (request, context) => serverEntry.fetch(request, { context });
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
    );
  }
  const netlifyTomlFile = path.resolve('netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `\
[build]
  command = "npm run build"
  publish = "${distDir}/${DIST_PUBLIC}"
[functions]
  included_files = ["${privateDir}/**"]
  directory = "netlify-functions"
`,
    );
  }
}
