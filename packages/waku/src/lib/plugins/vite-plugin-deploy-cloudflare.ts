import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { DIST_PUBLIC } from '../builder/constants.js';

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

// This is exported for vite-rsc. https://github.com/wakujs/waku/pull/1493
export function separatePublicAssetsFromFunctions({
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
