import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import * as vite from 'vite';
import type { Plugin, UserConfig } from 'vite';
import { BUILD_METADATA_FILE, DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils/path.js';
import { createProgressLogger } from '../utils/progress-logger.js';
import { consumeMultiplexedStream } from '../utils/stream.js';

export function buildStaticFilesPlugin({
  distDir,
}: {
  distDir: string;
}): Plugin {
  const dummySource = 'export const buildMetadata = new Map();';
  let userConfig: UserConfig;
  return {
    name: 'waku:vite-plugins:build-static-files',
    config(config) {
      userConfig = config;
    },
    configurePreviewServer(server) {
      const viteConfig = server.config;
      const entryPath = path.join(
        viteConfig.environments.rsc!.build.outDir,
        'index.js',
      );
      server.middlewares.use(async (_req, res, next) => {
        try {
          const entry: typeof import('../vite-entries/entry.server.js') =
            await import(pathToFileURL(entryPath).href);
          const response = await entry.INTERNAL_runFetch(
            process.env as never, // XXX is it correct to use process.env here?
            new Request('http://localhost:3000'),
          );
          Readable.fromWeb(response.body as never).pipe(res);
        } catch (err) {
          next(err);
        }
      });
    },
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
        await writeFile(buildMetadataFile, dummySource);

        // XXX isn't it weird to run vite in a vite plugin?
        const server = await vite.preview(userConfig);
        const baseUrl = server.resolvedUrls!.local[0]!;

        const progress = createProgressLogger();
        const emit = async (filePath: string, body: ReadableStream) => {
          const destFile = joinPath(rootDir, distDir, filePath);
          if (!destFile.startsWith(rootDir)) {
            throw new Error('Invalid filePath: ' + filePath);
          }
          // In partial mode, skip if the file already exists.
          if (
            fs.existsSync(destFile) &&
            // HACK: This feels a bit hacky
            destFile !== buildMetadataFile
          ) {
            return;
          }
          progress.update(`generating a file ${pc.dim(filePath)}`);
          await mkdir(joinPath(destFile, '..'), { recursive: true });
          if (typeof body === 'string') {
            await writeFile(destFile, body);
          } else {
            await pipeline(
              Readable.fromWeb(body as never),
              fs.createWriteStream(destFile),
            );
          }
        };
        console.log(pc.blue('[ssg] processing static generation...'));
        const startTime = performance.now();
        globalThis.__WAKU_RUN_BUILD_ROOT_DIR__ = rootDir;
        const response = await fetch(baseUrl);
        await consumeMultiplexedStream(response.body!, emit);
        globalThis.__WAKU_RUN_BUILD_ROOT_DIR__ = undefined;
        progress.done();
        const fileCount = progress.getCount();
        console.log(
          pc.green(
            `✓ ${fileCount} file${fileCount !== 1 ? 's' : ''} generated in ${Math.ceil(performance.now() - startTime)}ms`,
          ),
        );

        await new Promise<void>((resolve, reject) => {
          server.httpServer.close((err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        });
      },
    },
  };
}
