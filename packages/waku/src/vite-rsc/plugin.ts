import {
  mergeConfig,
  normalizePath,
  type RunnableDevEnvironment,
  type Plugin,
  type PluginOption,
  type UserConfig,
  type ViteDevServer,
} from 'vite';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Config } from '../config.js';
import { INTERNAL_setAllEnv, unstable_getBuildOptions } from '../server.js';
import { emitStaticFile, waitForTasks } from '../lib/builder/build.js';
import {
  getManagedEntries,
  getManagedMain,
} from '../lib/plugins/vite-plugin-rsc-managed.js';
import { deployVercelPlugin } from './deploy/vercel/plugin.js';
import { allowServerPlugin } from './plugins/allow-server.js';
import {
  DIST_PUBLIC,
  SRC_CLIENT_ENTRY,
  SRC_SERVER_ENTRY,
} from '../lib/builder/constants.js';
import { fsRouterTypegenPlugin } from '../lib/plugins/vite-plugin-fs-router-typegen.js';
import { deployNetlifyPlugin } from './deploy/netlify/plugin.js';
import { deployCloudflarePlugin } from './deploy/cloudflare/plugin.js';
import { deployPartykitPlugin } from './deploy/partykit/plugin.js';
import { deployDenoPlugin } from './deploy/deno/plugin.js';
import { deployAwsLambdaPlugin } from './deploy/aws-lambda/plugin.js';
import { filePathToFileURL, joinPath } from '../lib/utils/path.js';

const PKG_NAME = 'waku';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export type MainPluginOptions = {
  flags?: Flags | undefined;
  config?: Config | undefined;
};

export type Flags = {
  'experimental-compress'?: boolean | undefined;
  'experimental-partial'?: boolean | undefined;
  'with-vercel'?: boolean | undefined;
  'with-vercel-static'?: boolean | undefined;
  'with-netlify'?: boolean | undefined;
  'with-netlify-static'?: boolean | undefined;
  'with-cloudflare'?: boolean | undefined;
  'with-partykit'?: boolean | undefined;
  'with-deno'?: boolean | undefined;
  'with-aws-lambda'?: boolean | undefined;
};

export function mainPlugin(
  mainPluginOptions?: MainPluginOptions,
): PluginOption {
  const config: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    pagesDir: 'pages',
    apiDir: 'api',
    privateDir: 'private',
    rscBase: 'RSC',
    middleware: [
      'waku/middleware/context',
      'waku/middleware/dev-server',
      'waku/middleware/handler',
    ],
    unstable_honoEnhancer: undefined,
    unstable_viteConfigs: undefined,
    vite: undefined,
    ...mainPluginOptions?.config,
  };
  const flags = mainPluginOptions?.flags ?? {};
  let privatePath: string;
  let customServerEntry: string | undefined;

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
      ignoredPackageWarnings: [/.*/],
    }),
    {
      name: 'rsc:waku',
      async config(_config, env) {
        let viteRscConfig: UserConfig = {
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
                    index: path.join(__dirname, 'entry.browser.js'),
                  },
                },
              },
              optimizeDeps: {
                entries: [
                  `${config.srcDir}/${SRC_CLIENT_ENTRY}.*`,
                  `${config.srcDir}/${SRC_SERVER_ENTRY}.*`,
                  `${config.srcDir}/${config.pagesDir}/**/*.*`,
                ],
              },
            },
            ssr: {
              build: {
                rollupOptions: {
                  input: {
                    index: path.join(__dirname, 'entry.ssr.js'),
                  },
                },
              },
            },
            rsc: {
              build: {
                rollupOptions: {
                  input: {
                    index: path.join(__dirname, 'entry.server.js'),
                  },
                },
              },
            },
          },
        };

        // backcompat for old vite config overrides
        // Note that adding `plugins` here is not supported and
        // such plugins should be moved to `config.vite`.
        viteRscConfig = mergeConfig(
          viteRscConfig,
          config?.unstable_viteConfigs?.['common']?.() ?? {},
        );
        if (env.command === 'serve') {
          viteRscConfig = mergeConfig(
            viteRscConfig,
            config?.unstable_viteConfigs?.['dev-main']?.() ?? {},
          );
        } else {
          viteRscConfig = mergeConfig(
            viteRscConfig,
            config?.unstable_viteConfigs?.['build-server']?.() ?? {},
          );
        }

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
        // https://github.com/hi-ogawa/vite-plugins/issues/968
        if (environmentConfig.optimizeDeps?.include) {
          environmentConfig.optimizeDeps.include =
            environmentConfig.optimizeDeps.include.map((name) => {
              if (name.startsWith('@vitejs/plugin-rsc/')) {
                name = `${PKG_NAME} > ${name}`;
              }
              return name;
            });
        }

        environmentConfig.build ??= {};
        environmentConfig.build.outDir = `${config.distDir}/${name}`;
        if (name === 'client') {
          environmentConfig.build.outDir = `${config.distDir}/${DIST_PUBLIC}`;
          if (flags['experimental-partial']) {
            environmentConfig.build.emptyOutDir = false;
          }
        }
        // top-level-await in packages/waku/src/lib/middleware/context.ts
        if (name !== 'client') {
          environmentConfig.build.target ??= 'esnext';
        }

        return {
          resolve: {
            noExternal: env.command === 'build' ? true : [PKG_NAME],
          },
          optimizeDeps: {
            include: name === 'ssr' ? [`${PKG_NAME} > html-react-parser`] : [],
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
              const mod = await environment.runner.import(entryId);
              await getRequestListener(mod.default)(req, res);
            } catch (e) {
              next(e);
            }
          });
        };
      },
      async configurePreviewServer(server) {
        const { getRequestListener } = await import('@hono/node-server');
        const module = await import(
          pathToFileURL(path.resolve('./dist/rsc/index.js')).href
        );
        server.middlewares.use(getRequestListener(module.default));
      },
    },
    {
      name: 'rsc:waku:user-entries',
      // resolve user entries and fallbacks to "managed mode" if not found.
      async resolveId(source, _importer, options) {
        if (source === 'virtual:vite-rsc-waku/server-entry') {
          return `\0` + source;
        }
        if (source === 'virtual:vite-rsc-waku/server-entry-inner') {
          const resolved = await this.resolve(
            `/${config.srcDir}/${SRC_SERVER_ENTRY}`,
            undefined,
            options,
          );
          customServerEntry = resolved?.id;
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
          return getManagedEntries(
            joinPath(
              this.environment.config.root,
              `${config.srcDir}/server-entry.js`,
            ),
            'src',
            {
              pagesDir: config.pagesDir,
              apiDir: config.apiDir,
            },
          );
        }
        if (id === '\0virtual:vite-rsc-waku/client-entry') {
          return getManagedMain();
        }
      },
      transform(code, id) {
        // rewrite `fsRouter(import.meta.url, ...)` in custom server entry
        // e.g. examples/11_fs-router/src/server-entry.tsx
        // TODO: rework fsRouter to entirely avoid fs access on runtime
        if (id === customServerEntry && code.includes('fsRouter')) {
          const replacement = JSON.stringify(filePathToFileURL(id));
          code = code.replaceAll(/\bimport\.meta\.url\b/g, () => replacement);
          return code;
        }
      },
    },
    createVirtualPlugin('vite-rsc-waku/middlewares', async function () {
      const ids: string[] = [];
      for (const file of config.middleware) {
        // dev-server logic is all handled by `@vitejs/plugin-rsc`, so skipped.
        if (file === 'waku/middleware/dev-server') {
          continue;
        }

        // new `handler` is exported from `waku/vite-rsc/middleware/handler.js`
        if (file === 'waku/middleware/handler') {
          ids.push(path.join(__dirname, 'middleware/handler.js'));
          continue;
        }

        // resolve local files
        let id = file;
        if (file[0] === '.') {
          const resolved = await this.resolve(file);
          if (resolved) {
            id = resolved.id;
          } else {
            this.error(`failed to resolve custom middleware '${file}'`);
          }
        }
        ids.push(id);
      }

      let code = '';
      ids.forEach((file, i) => {
        code += `import __m_${i} from ${JSON.stringify(file)};\n`;
      });
      code += `export const middlewares = [`;
      code += ids.map((_, i) => `__m_${i}`).join(',\n');
      code += `];\n`;
      return code;
    }),
    createVirtualPlugin('vite-rsc-waku/hono-enhancer', async function () {
      if (!config?.unstable_honoEnhancer) {
        return `export const honoEnhancer = (app) => app;`;
      }
      let id = config.unstable_honoEnhancer;
      if (id[0] === '.') {
        const resolved = await this.resolve(id);
        if (resolved) {
          id = resolved.id;
        }
      }
      return `
        import __m from ${JSON.stringify(id)};
        export const honoEnhancer = __m;
      `;
    }),
    createVirtualPlugin('vite-rsc-waku/config', async function () {
      return `
        export const config = ${JSON.stringify({ ...config, vite: undefined })};
        export const flags = ${JSON.stringify(flags)};
        export const isBuild = ${JSON.stringify(this.environment.mode === 'build')};
      `;
    }),
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
      // cf. packages/waku/src/lib/plugins/vite-plugin-rsc-hmr.ts
      name: 'rsc:waku:patch-server-hmr',
      apply: 'serve',
      async transform(code, id) {
        if (this.environment.name !== 'client') {
          return;
        }
        if (id.includes('/waku/dist/minimal/client.js')) {
          return code.replace(
            /\nexport const fetchRsc = \(.*?\)=>\{/,
            (m) =>
              m +
              `
{
  const refetchRsc = () => {
    delete fetchCache[ENTRY];
    const data = fetchRsc(rscPath, rscParams, fetchCache);
    fetchCache[SET_ELEMENTS](() => data);
  };
  globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
  const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(globalThis.__WAKU_REFETCH_RSC__);
  if (index !== -1) {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRsc);
  } else {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.push(refetchRsc);
  }
  globalThis.__WAKU_REFETCH_RSC__ = refetchRsc;
}
`,
          );
        } else if (id.includes('/waku/dist/router/client.js')) {
          return code.replace(
            /\nconst InnerRouter = \(.*?\)=>\{/,
            (m) =>
              m +
              `
{
  const refetchRoute = () => {
    staticPathSetRef.current.clear();
    cachedIdSetRef.current.clear();
    const rscPath = encodeRoutePath(route.path);
    const rscParams = createRscParams(route.query, []);
    refetch(rscPath, rscParams);
  };
  globalThis.__WAKU_RSC_RELOAD_LISTENERS__ ||= [];
  const index = globalThis.__WAKU_RSC_RELOAD_LISTENERS__.indexOf(globalThis.__WAKU_REFETCH_ROUTE__);
  if (index !== -1) {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.splice(index, 1, refetchRoute);
  } else {
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__.unshift(refetchRoute);
  }
  globalThis.__WAKU_REFETCH_ROUTE__ = refetchRoute;
}
`,
          );
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
      // cf. packages/waku/src/lib/builder/build.ts
      buildApp: {
        order: 'post',
        async handler(builder) {
          // import server entry
          const viteConfig = builder.config;
          const entryPath = path.join(
            viteConfig.environments.rsc!.build.outDir,
            'index.js',
          );
          const entry: typeof import('./entry.server.js') = await import(
            pathToFileURL(entryPath).href
          );

          // run `handleBuild`
          INTERNAL_setAllEnv(process.env as any);
          unstable_getBuildOptions().unstable_phase = 'emitStaticFiles';
          const buildConfigs = await entry.handleBuild();
          for await (const buildConfig of buildConfigs || []) {
            if (buildConfig.type === 'file') {
              emitStaticFile(
                viteConfig.root,
                { distDir: config.distDir },
                buildConfig.pathname,
                buildConfig.body,
              );
            } else {
              // eslint-disable-next-line
              0 &&
                console.warn(
                  '[waku:vite-rsc] ignored build task:',
                  buildConfig,
                );
            }
          }
          await waitForTasks();

          // save platform data
          const platformDataCode = `globalThis.__WAKU_SERVER_PLATFORM_DATA__ = ${JSON.stringify((globalThis as any).__WAKU_SERVER_PLATFORM_DATA__ ?? {}, null, 2)}\n`;
          const platformDataFile = path.join(
            builder.config.environments.rsc!.build.outDir,
            '__waku_set_platform_data.js',
          );
          fs.writeFileSync(platformDataFile, platformDataCode);
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
    !!(
      flags['with-vercel'] ||
      flags['with-vercel-static'] ||
      process.env.VERCEL
    ) &&
      deployVercelPlugin({
        config,
        serverless: !flags['with-vercel-static'],
      }),
    !!(
      flags['with-netlify'] ||
      flags['with-netlify-static'] ||
      process.env.NETLIFY
    ) &&
      deployNetlifyPlugin({
        config,
        serverless: !flags['with-netlify-static'],
      }),
    !!flags['with-cloudflare'] && deployCloudflarePlugin({ config }),
    !!flags['with-partykit'] && deployPartykitPlugin({ config }),
    !!flags['with-deno'] && deployDenoPlugin({ config }),
    !!flags['with-aws-lambda'] &&
      deployAwsLambdaPlugin({
        config,
        streaming: process.env.DEPLOY_AWS_LAMBDA_STREAMING === 'true',
      }),
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

function createVirtualPlugin(name: string, load: Plugin['load']) {
  name = 'virtual:' + name;
  return {
    name: `waku:virtual-${name}`,
    resolveId(source, _importer, _options) {
      return source === name ? '\0' + name : undefined;
    },
    load(id, options) {
      if (id === '\0' + name) {
        return (load as any).apply(this, [id, options]);
      }
    },
  } satisfies Plugin;
}
