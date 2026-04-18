import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import type { Plugin } from 'vite';
import { joinPath } from '../utils/path.js';
import { createProgressLogger } from '../utils/progress-logger.js';
import {
  pruneRscBuildOutputs,
  type RscBuildOutputState,
} from './build-output-pruning.js';

export function buildStaticFilesPlugin({
  distDir,
  rscBuildOutputState,
}: {
  distDir: string;
  rscBuildOutputState: RscBuildOutputState;
}): Plugin {
  return {
    name: 'waku:vite-plugins:build-static-files',
    buildApp: {
      async handler(builder) {
        const viteConfig = builder.config;
        const rootDir = viteConfig.root;
        const progress = createProgressLogger();
        const emitFile = async (filePath: string, body: ReadableStream) => {
          const destFile = joinPath(rootDir, distDir, filePath);
          if (!destFile.startsWith(rootDir)) {
            throw new Error('Invalid filePath: ' + filePath);
          }
          progress.update(`generating a file ${pc.dim(filePath)}`);
          await mkdir(joinPath(destFile, '..'), { recursive: true });
          await pipeline(
            Readable.fromWeb(body as never),
            fs.createWriteStream(destFile),
          );
        };
        const entryPath = path.join(
          viteConfig.environments.rsc!.build.outDir,
          'build.js',
        );
        console.log(pc.blue('[ssg] processing static generation...'));
        const startTime = performance.now();
        const entry: typeof import('../vite-entries/entry.build.js') =
          await import(pathToFileURL(entryPath).href);
        await entry.INTERNAL_runBuild({ rootDir, emitFile });
        await pruneRscBuildOutputs({
          rootDir,
          distDir,
          state: rscBuildOutputState,
        });
        progress.done();
        const fileCount = progress.getCount();
        console.log(
          pc.green(
            `✓ ${fileCount} file${fileCount !== 1 ? 's' : ''} generated in ${Math.ceil(performance.now() - startTime)}ms`,
          ),
        );
      },
    },
  };
}
