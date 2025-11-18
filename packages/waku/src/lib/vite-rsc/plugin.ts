import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import MagicString from 'magic-string';
import pc from 'picocolors';
import {
  type Plugin,
  type PluginOption,
  type RunnableDevEnvironment,
  type UserConfig,
  type ViteDevServer,
  mergeConfig,
  normalizePath,
} from 'vite';
import type { Config } from '../../config.js';
import {
  BUILD_METADATA_FILE,
  DIST_PUBLIC,
  DIST_SERVER,
  SRC_CLIENT_ENTRY,
  SRC_PAGES,
  SRC_SERVER_ENTRY,
} from '../constants.js';
import { getDefaultAdapter } from '../utils/default-adapter.js';
import {
  getManagedClientEntry,
  getManagedServerEntry,
} from '../utils/managed.js';
import { joinPath } from '../utils/path.js';
import { allowServerPlugin } from '../vite-plugins/allow-server.js';
import { fsRouterTypegenPlugin } from '../vite-plugins/fs-router-typegen.js';

const PKG_NAME = 'waku';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export type RscPluginOptions = {
  config?: Config | undefined;
};

export function rscPlugin(rscPluginOptions?: RscPluginOptions): PluginOption {
  const config: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    privateDir: 'private',
    rscBase: 'RSC',
    adapter: getDefaultAdapter(),
    vite: undefined,
    ...rscPluginOptions?.config,
  };
  // ensure trailing slash
  if (!config.basePath.endsWith('/')) {
    config.basePath += '/';
  }
  let privatePath: string;

  const extraPlugins = [...(config.vite?.plugins ?? [])];
  // add react plugin automatically if users didn't include it on their own (e.g. swc, oxc, babel react compiler)
  if (
    !extraPlugins
      .flat()
      .some((p) => p && 'name' in p && p.name.startsWith('vite:react'))
  ) {
    extraPlugins.push(react());
  }

  return [
    ...extraPlugins,
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    {
      name: 'waku:rsc',
      async config(_config) {
        let viteRscConfig: UserConfig = {
          base: config.basePath,
          define: {
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
            'import.meta.env.WAKU_CONFIG_BASE_PATH': JSON.stringify(
              config.basePath,
            ),
            'import.meta.env.WAKU_CONFIG_RSC_BASE': JSON.stringify(
              config.rscBase,
            ),
            // CLI has loaded dotenv already at this point
            ...Object.fromEntries(
              Object.entries(process.env).flatMap(([k, v]) =>
                k.startsWith('WAKU_PUBLIC_')
                  ? [
                      [`import.meta.env.${k}`, JSON.stringify(v)],
                      // TODO: defining `process.env` on client dev is not recommended.
                      // see https://github.com/vitest-dev/vitest/pull/6718
                      [`process.env.${k}`, JSON.stringify(v)],
                    ]
                  : [],
              ),
            ),
          },
          environments: {
            client: {
              build: {
                rollupOptions: {
                  input: {
                    index: path.join(
                      __dirname,
                      '../vite-entries/entry.browser.js',
                    ),
                  },
                },
              },
              optimizeDeps: {
                entries: [
                  `${config.srcDir}/${SRC_CLIENT_ENTRY}.*`,
                  `${config.srcDir}/${SRC_SERVER_ENTRY}.*`,
                  `${config.srcDir}/${SRC_PAGES}/**/*.*`,
                ],
              },
            },
            ssr: {
              build: {
                rollupOptions: {
                  input: {
                    index: path.join(__dirname, '../vite-entries/entry.ssr.js'),
                  },
                },
              },
            },
            rsc: {
              build: {
                rollupOptions: {
                  input: {
                    index: path.join(
                      __dirname,
                      '../vite-entries/entry.server.js',
                    ),
                    build: path.join(
                      __dirname,
                      '../vite-entries/entry.build.js',
                    ),
                  },
                },
              },
            },
          },
        };

        if (config.vite) {
          viteRscConfig = mergeConfig(viteRscConfig, {
            ...config.vite,
            plugins: undefined,
          });
        }

        return viteRscConfig;
      },
      configEnvironment(name, environmentConfig, env) {
        // make @vitejs/plugin-rsc usable as a transitive dependency
        // by rewriting `optimizeDeps.include`. e.g.
        // include: ["@vitejs/plugin-rsc/vendor/xxx", "@vitejs/plugin-rsc > yyy"]
        // ⇓
        // include: ["waku > @vitejs/plugin-rsc/vendor/xxx", "waku > @vitejs/plugin-rsc > yyy"]
        if (environmentConfig.optimizeDeps?.include) {
          environmentConfig.optimizeDeps.include =
            environmentConfig.optimizeDeps.include.map((name) => {
              if (name.startsWith('@vitejs/plugin-rsc')) {
                name = `${PKG_NAME} > ${name}`;
              }
              return name;
            });
        }

        environmentConfig.build ??= {};
        environmentConfig.build.outDir = `${config.distDir}/${name}`;
        if (name === 'rsc') {
          environmentConfig.build.outDir = `${config.distDir}/${DIST_SERVER}`;
        }
        if (name === 'ssr') {
          environmentConfig.build.outDir = `${config.distDir}/${DIST_SERVER}/ssr`;
        }
        if (name === 'client') {
          environmentConfig.build.outDir = `${config.distDir}/${DIST_PUBLIC}`;
        }

        return {
          resolve: {
            noExternal: env.command === 'build' ? true : [PKG_NAME],
          },
          optimizeDeps: {
            exclude: [PKG_NAME, 'waku/minimal/client', 'waku/router/client'],
          },
        };
      },
      configResolved(viteConfig) {
        privatePath = joinPath(viteConfig.root, config.privateDir);
      },
      async configureServer(server) {
        const { getRequestListener } = await import('@hono/node-server');
        const environment = server.environments.rsc! as RunnableDevEnvironment;
        const entryId = (environment.config.build.rollupOptions.input as any)
          .index;
        return () => {
          server.middlewares.use(async (req, res, next) => {
            try {
              // Restore Vite's automatically stripped base
              req.url = req.originalUrl;
              const mod: typeof import('../vite-entries/entry.server.js') =
                await environment.runner.import(entryId);
              await getRequestListener((req, ...args) =>
                mod.INTERNAL_runFetch(process.env as any, req, ...args),
              )(req, res);
            } catch (e) {
              next(e);
            }
          });
        };
      },
    },
    {
      name: 'waku:user-entries',
      // resolve user entries and fallbacks to "managed mode" if not found.
      async resolveId(source, _importer, options) {
        if (source === 'virtual:vite-rsc-waku/server-entry') {
          return '\0' + source;
        }
        if (source === 'virtual:vite-rsc-waku/server-entry-inner') {
          const resolved = await this.resolve(
            `/${config.srcDir}/${SRC_SERVER_ENTRY}`,
            undefined,
            options,
          );
          return resolved ? resolved : '\0' + source;
        }
        if (source === 'virtual:vite-rsc-waku/client-entry') {
          const resolved = await this.resolve(
            `/${config.srcDir}/${SRC_CLIENT_ENTRY}`,
            undefined,
            options,
          );
          return resolved ? resolved : '\0' + source;
        }
      },
      load(id) {
        if (id === '\0virtual:vite-rsc-waku/server-entry') {
          return `\
export { default } from 'virtual:vite-rsc-waku/server-entry-inner';
if (import.meta.hot) {
  import.meta.hot.accept()
}
`;
        }
        if (id === '\0virtual:vite-rsc-waku/server-entry-inner') {
          return getManagedServerEntry(config);
        }
        if (id === '\0virtual:vite-rsc-waku/client-entry') {
          return getManagedClientEntry();
        }
      },
    },
    virtualConfigPlugin(config),
    virtualAdapterPlugin(config),
    virtualNotFoundPlugin(),
    pathMacroPlugin(),
    {
      // rewrite `react-server-dom-webpack` in `waku/minimal/client`
      name: 'waku:patch-webpack',
      enforce: 'pre',
      resolveId(source, _importer, _options) {
        if (source === 'react-server-dom-webpack/client') {
          return '\0' + source;
        }
      },
      load(id) {
        if (id === '\0react-server-dom-webpack/client') {
          if (this.environment.name === 'client') {
            return `
              import * as ReactClient from ${JSON.stringify(import.meta.resolve('@vitejs/plugin-rsc/browser'))};
              export default ReactClient;
            `;
          }
          return `export default {}`;
        }
      },
    },
    buildPlugin(config),
    {
      name: 'waku:private-dir',
      load(id) {
        if (this.environment.name === 'rsc') {
          return;
        }
        if (id.startsWith(privatePath)) {
          throw new Error(
            'Load private directory in client side is not allowed',
          );
        }
      },
      hotUpdate(ctx) {
        if (
          this.environment.name === 'rsc' &&
          ctx.file.startsWith(privatePath)
        ) {
          ctx.server.environments.client.hot.send({
            type: 'custom',
            event: 'rsc:update',
            data: {
              type: 'waku:private',
              file: ctx.file,
            },
          });
        }
      },
    },
    rscIndexPlugin(),
    fsRouterTypegenPlugin({ srcDir: config.srcDir }),
  ];
}

function rscIndexPlugin(): Plugin {
  let server: ViteDevServer | undefined;
  return {
    name: 'waku:fallback-html',
    config() {
      return {
        environments: {
          client: {
            build: {
              rollupOptions: {
                input: {
                  indexHtml: 'index.html',
                },
              },
            },
          },
        },
      };
    },
    configureServer(server_) {
      server = server_;
    },
    async resolveId(source, _importer, _options) {
      if (source === 'index.html') {
        // this resolve is called as fallback only when Vite didn't find an actual file `index.html`
        // we need to keep exact same name to have `index.html` as an output file.
        assert(this.environment.name === 'client');
        assert(this.environment.mode === 'build');
        return source;
      }
      if (source === 'virtual:vite-rsc-waku/fallback-html') {
        assert(this.environment.name === 'ssr');
        return { id: '\0' + source, moduleSideEffects: true };
      }
    },
    async load(id) {
      if (id === 'index.html') {
        return `<html><body></body></html>`;
      }
      if (id === '\0virtual:vite-rsc-waku/fallback-html') {
        let html = `<html><body></body></html>`;
        if (this.environment.mode === 'dev') {
          if (fs.existsSync('index.html')) {
            // TODO: inline script not invalidated propery?
            this.addWatchFile(path.resolve('index.html'));
            html = fs.readFileSync('index.html', 'utf-8');
            html = await server!.transformIndexHtml('/', html);
          }
        } else {
          // skip during scan build
          if (this.environment.config.build.write) {
            const config = this.environment.getTopLevelConfig();
            const file = path.join(
              config.environments.client!.build.outDir,
              'index.html',
            );
            html = fs.readFileSync(file, 'utf-8');
            // remove index.html from the build to avoid default preview server serving it
            fs.rmSync(file);
          }
        }
        return `export default ${JSON.stringify(html)};`;
      }
    },
  };
}

function virtualConfigPlugin(config: Required<Config>): Plugin {
  const configModule = 'virtual:vite-rsc-waku/config';
  let rootDir: string;
  return {
    name: 'waku:virtual-config',
    configResolved(viteConfig) {
      rootDir = viteConfig.root;
    },
    resolveId(source, _importer, _options) {
      return source === configModule ? '\0' + configModule : undefined;
    },
    load(id) {
      if (id === '\0' + configModule) {
        return `
        export const rootDir = ${JSON.stringify(rootDir)};
        export const config = ${JSON.stringify({ ...config, vite: undefined })};
        export const isBuild = ${JSON.stringify(this.environment.mode === 'build')};
      `;
      }
    },
  };
}

function virtualAdapterPlugin(config: Required<Config>): Plugin {
  const adapterModule = 'waku/adapters/default';
  return {
    name: 'waku:virtual-adapter',
    resolveId(source, _importer, _options) {
      return source === adapterModule
        ? this.resolve(config.adapter)
        : undefined;
    },
  };
}

function virtualNotFoundPlugin() {
  // This provides raw html `public/404.html` for SSR fallback.
  // It's not used when router has 404 page.
  const name = 'virtual:vite-rsc-waku/not-found';
  return {
    name: `waku:virtual-${name}`,
    resolveId(source, _importer, _options) {
      return source === name ? '\0' + name : undefined;
    },
    load(id) {
      if (id === '\0' + name) {
        const notFoundHtmlPath = path.resolve(DIST_PUBLIC, '404.html');
        if (!fs.existsSync(notFoundHtmlPath)) {
          return `export default undefined`;
        }
        return `export { default } from ${JSON.stringify(notFoundHtmlPath + '?raw')}`;
      }
    },
  } satisfies Plugin;
}

function relativePath(pathFrom: string, pathTo: string) {
  let relPath = path.posix.relative(pathFrom, pathTo);
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath;
  }
  return relPath;
}

function pathMacroPlugin(): Plugin {
  const token = 'import.meta.__WAKU_ORIGINAL_PATH__';
  let rootDir: string;
  return {
    name: 'waku:path-macro',
    enforce: 'pre',
    configResolved(viteConfig) {
      rootDir = viteConfig.root;
    },
    transform(code, id) {
      if (id.startsWith('\0') || id.includes('virtual:')) {
        return;
      }
      const normalizedPath = id.split('?')[0]!;
      if (!['.js', '.mjs', '.cjs'].includes(path.extname(normalizedPath))) {
        return;
      }
      if (!code.includes(token)) {
        return;
      }
      const originalPath = relativePath(rootDir, normalizedPath);
      const s = new MagicString(code);
      let idx = code.indexOf(token);
      if (idx === -1) {
        return;
      }
      while (idx !== -1) {
        s.overwrite(idx, idx + token.length, JSON.stringify(originalPath));
        idx = code.indexOf(token, idx + 1);
      }
      return {
        code: s.toString(),
        map: s.generateMap({ hires: true }),
      };
    },
  };
}

const forceRelativePath = (s: string) => (s.startsWith('.') ? s : './' + s);

function buildPlugin({ distDir }: { distDir: string }): Plugin {
  const virtualModule = 'virtual:vite-rsc-waku/build-data';
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

        let fileCount = 0;
        const showProgress = process.stdout.isTTY && !process.env.CI;
        const throttleWrite = throttle((s: string) => writeLine(s));

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
          fileCount++;
          if (showProgress) {
            throttleWrite(
              `(${fileCount}) generating a file  ${pc.dim(filePath)}`,
            );
          }
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
        if (showProgress) {
          clearLine();
        }
        console.log(
          pc.green(
            `✓ ${fileCount} file${fileCount !== 1 ? 's' : ''} generated in ${Math.ceil(performance.now() - startTime)}ms`,
          ),
        );
      },
    },
  };
}

// copied from Vite
// https://github.com/vitejs/vite/blob/fa3753a0f3a6c12659d8a68eefbd055c5ab90552/packages/vite/src/node/plugins/reporter.ts#L342
function writeLine(output: string) {
  clearLine();
  if (output.length < process.stdout.columns) {
    process.stdout.write(output);
  } else {
    process.stdout.write(
      output.slice(0, Math.max(0, process.stdout.columns - 1)),
    );
  }
}

function clearLine() {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
}

function throttle(fn: (...args: any[]) => void) {
  let timerHandle: NodeJS.Timeout | null = null;
  return (...args: any[]) => {
    if (timerHandle) {
      return;
    }
    fn(...args);
    timerHandle = setTimeout(() => {
      timerHandle = null;
    }, 50);
  };
}
