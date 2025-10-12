import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Config } from '../../config.js';
import { INTERNAL_setAllEnv } from '../../server.js';
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
  flags?: Flags | undefined;
  config?: Config | undefined;
};

export type Flags = {
  'experimental-partial'?: boolean | undefined;
};

export function rscPlugin(rscPluginOptions?: RscPluginOptions): PluginOption {
  const config: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    privateDir: 'private',
    rscBase: 'RSC',
    vite: undefined,
    ...rscPluginOptions?.config,
  };
  // ensure trailing slash
  if (!config.basePath.endsWith('/')) {
    config.basePath += '/';
  }
  const flags = rscPluginOptions?.flags ?? {};
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
      name: 'rsc:waku',
      async config(_config) {
        let viteRscConfig: UserConfig = {
          base: config.basePath,
          define: {
            'import.meta.env.WAKU_CONFIG_BASE_PATH': JSON.stringify(
              config.basePath,
            ),
            'import.meta.env.WAKU_CONFIG_RSC_BASE': JSON.stringify(
              config.rscBase,
            ),
            // packages/waku/src/lib/plugins/vite-plugin-rsc-env.ts
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
          environmentConfig.build.outDir = `${config.distDir}/server`;
        }
        if (name === 'ssr') {
          environmentConfig.build.outDir = `${config.distDir}/server/ssr`;
        }
        if (name === 'client') {
          environmentConfig.build.outDir = `${config.distDir}/${DIST_PUBLIC}`;
          if (flags['experimental-partial']) {
            environmentConfig.build.emptyOutDir = false;
          }
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
        INTERNAL_setAllEnv(process.env as any);
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
              await getRequestListener(mod.runFetch)(req, res);
            } catch (e) {
              next(e);
            }
          });
        };
      },
    },
    {
      name: 'rsc:waku:user-entries',
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
    createVirtualPlugin(config),
    {
      // rewrite `react-server-dom-webpack` in `waku/minimal/client`
      name: 'rsc:waku:patch-webpack',
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
    {
      name: 'rsc:waku:handle-build',
      resolveId(source) {
        if (source === 'virtual:vite-rsc-waku/set-platform-data') {
          assert.equal(this.environment.name, 'rsc');
          if (this.environment.mode === 'build') {
            return { id: source, external: true, moduleSideEffects: true };
          }
          return '\0' + source;
        }
      },
      async load(id) {
        if (id === '\0virtual:vite-rsc-waku/set-platform-data') {
          // no-op during dev
          assert.equal(this.environment.mode, 'dev');
          return `export {}`;
        }
      },
      renderChunk(code, chunk) {
        if (code.includes(`virtual:vite-rsc-waku/set-platform-data`)) {
          const replacement = normalizeRelativePath(
            path.relative(
              path.join(chunk.fileName, '..'),
              '__waku_set_platform_data.js',
            ),
          );
          return code.replaceAll(
            'virtual:vite-rsc-waku/set-platform-data',
            () => replacement,
          );
        }
      },
      buildApp: {
        async handler(builder) {
          const viteConfig = builder.config;

          const savePlatformData = async () => {
            const platformDataCode = `globalThis.__WAKU_SERVER_PLATFORM_DATA__ = ${JSON.stringify((globalThis as any).__WAKU_SERVER_PLATFORM_DATA__ ?? {}, null, 2)}\n`;
            const platformDataFile = path.join(
              builder.config.environments.rsc!.build.outDir,
              '__waku_set_platform_data.js',
            );
            fs.writeFileSync(platformDataFile, platformDataCode);
          };

          const entryPath = path.join(
            viteConfig.environments.rsc!.build.outDir,
            'build.js',
          );
          const entry: typeof import('../vite-entries/entry.build.js') =
            await import(pathToFileURL(entryPath).href);
          await entry.runBuild({ savePlatformData });
        },
      },
    },
    // packages/waku/src/lib/plugins/vite-plugin-rsc-private.ts
    {
      name: 'rsc:private-dir',
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

// packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
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

function normalizeRelativePath(s: string) {
  s = normalizePath(s);
  return s[0] === '.' ? s : './' + s;
}

function createVirtualPlugin(config: Required<Config>) {
  const name = 'virtual:vite-rsc-waku/config';
  let rootDir: string;
  return {
    name: `waku:virtual-${name}`,
    configResolved(viteConfig) {
      rootDir = viteConfig.root;
    },
    resolveId(source, _importer, _options) {
      return source === name ? '\0' + name : undefined;
    },
    load(id) {
      if (id === '\0' + name) {
        return `
        export const rootDir = ${JSON.stringify(rootDir)};
        export const config = ${JSON.stringify({ ...config, vite: undefined })};
        export const isBuild = ${JSON.stringify(this.environment.mode === 'build')};
      `;
      }
    },
  } satisfies Plugin;
}
