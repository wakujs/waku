import fs from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import type { Plugin } from 'vite';
import { BUILD_METADATA_FILE, DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils/path.js';
import { createProgressLogger } from '../utils/progress-logger.js';

export function buildStaticFilesPlugin({
  distDir,
}: {
  distDir: string;
}): Plugin {
  return {
    name: 'waku:vite-plugins:build-static-files',
    buildApp: {
      async handler(builder) {
        const viteConfig = builder.config;
        const rootDir = viteConfig.root;
        const buildMetadataFile = joinPath(
          rootDir,
          distDir,
          DIST_SERVER,
          BUILD_METADATA_FILE,
        );
        const progress = createProgressLogger();
        const emitFile = async (filePath: string, body: ReadableStream) => {
          const destFile = joinPath(rootDir, distDir, filePath);
          if (!destFile.startsWith(rootDir)) {
            throw new Error('Invalid filePath: ' + filePath);
          }
          // In partial mode, skip if the file already exists.
          // TODO: We'll revisit this: https://github.com/wakujs/waku/issues/1790
          if (
            fs.existsSync(destFile) &&
            // HACK: This feels a bit hacky
            destFile !== buildMetadataFile
          ) {
            return;
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
