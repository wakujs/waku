import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pathToFileURL } from 'node:url';
import pc from 'picocolors';
import { type Plugin, normalizePath } from 'vite';
import { BUILD_METADATA_FILE, DIST_SERVER } from '../constants.js';
import { joinPath } from '../utils/path.js';
import { createProgressLogger } from '../utils/progress-logger.js';

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);

export function buildMetadataPlugin({ distDir }: { distDir: string }): Plugin {
  const virtualModule = 'virtual:vite-rsc-waku/build-metadata';
  const dummySource = 'export const buildMetadata = new Map();';
  return {
    name: 'waku:build',
    resolveId(source, _importer, _options) {
      if (source === virtualModule) {
        assert.equal(this.environment.name, 'rsc');
        if (this.environment.mode === 'build') {
          return { id: source, external: true, moduleSideEffects: true };
        }
        return '\0' + virtualModule;
      }
    },
    load(id) {
      if (id === '\0' + virtualModule) {
        // no-op during dev
        assert.equal(this.environment.mode, 'dev');
        return dummySource;
      }
    },
    renderChunk(code, chunk) {
      if (code.includes(virtualModule)) {
        assert.equal(this.environment.name, 'rsc');
        const replacement = forceRelativePath(
          normalizePath(
            path.relative(path.join(chunk.fileName, '..'), BUILD_METADATA_FILE),
          ),
        );
        return code.replaceAll(virtualModule, () => replacement);
      }
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

        const progress = createProgressLogger();
        const emitFile = async (
          filePath: string,
          body: ReadableStream | string,
        ) => {
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
