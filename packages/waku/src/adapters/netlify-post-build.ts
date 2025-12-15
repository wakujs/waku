import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
  if (serverless) {
    const functionsDir = path.resolve('netlify-functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `\
const { INTERNAL_runFetch } = await import('../${distDir}/server/index.js');

export default async (request, context) =>
  INTERNAL_runFetch(process.env, request, { context });

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
