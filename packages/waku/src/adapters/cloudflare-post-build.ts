import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default async function postBuild({
  distDir,
  DIST_PUBLIC,
}: {
  distDir: string;
  DIST_PUBLIC: string;
}) {
  const SERVE_JS = 'serve-cloudflare.js';
  const serveCode = `
import { INTERNAL_runFetch } from './server/index.js';

export default {
  fetch: (request, env, ctx) => INTERNAL_runFetch(env, request, env, ctx),
};
`;
  const outDir = path.resolve(distDir);
  const assetsDistDir = path.join(outDir, 'assets');
  const workerDistDir = path.join(outDir, 'worker');

  fs.writeFileSync(path.join(outDir, SERVE_JS), serveCode);

  separatePublicAssetsFromFunctions({
    outDir,
    assetsDir: assetsDistDir,
    functionDir: workerDistDir,
  });

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

  function copyFiles(
    srcDir: string,
    destDir: string,
    extensions: readonly string[],
  ) {
    const files = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const file of files) {
      const srcPath = path.join(srcDir, file.name);
      const destPath = path.join(destDir, file.name);
      if (file.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyFiles(srcPath, destPath, extensions);
      } else if (extensions.some((ext) => file.name.endsWith(ext))) {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  function copyDirectory(srcDir: string, destDir: string) {
    const files = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const file of files) {
      const srcPath = path.join(srcDir, file.name);
      const destPath = path.join(destDir, file.name);
      if (file.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
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
      `dist_${crypto.randomBytes(16).toString('hex')}`,
    );
    const tempPublicDir = path.join(tempDist, DIST_PUBLIC);
    const workerPublicDir = path.join(functionDir, DIST_PUBLIC);

    // Create a temp dir to prepare the separated files
    fs.rmSync(tempDist, { recursive: true, force: true });
    fs.mkdirSync(tempDist, { recursive: true });

    // Move the current dist dir to the temp dir
    // Folders are copied instead of moved to avoid issues on Windows
    copyDirectory(outDir, tempDist);
    fs.rmSync(outDir, { recursive: true, force: true });

    // Create empty directories at the desired deploy locations
    // for the function and the assets
    fs.mkdirSync(functionDir, { recursive: true });
    fs.mkdirSync(assetsDir, { recursive: true });

    // Move tempDist/public to assetsDir
    copyDirectory(tempPublicDir, assetsDir);
    fs.rmSync(tempPublicDir, { recursive: true, force: true });

    // Move tempDist to functionDir
    copyDirectory(tempDist, functionDir);
    fs.rmSync(tempDist, { recursive: true, force: true });

    // Traverse assetsDir and copy specific files to functionDir/public
    fs.mkdirSync(workerPublicDir, { recursive: true });
    copyFiles(assetsDir, workerPublicDir, [
      '.txt',
      '.html',
      '.json',
      '.js',
      '.css',
    ]);
  }
}
