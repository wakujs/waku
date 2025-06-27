import {
  mergeConfig,
  normalizePath,
  type EnvironmentOptions,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from 'vite';
import react from '@vitejs/plugin-react';
import rsc from '@hiogawa/vite-rsc/plugin';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Config } from '../config.js';
import { unstable_getBuildOptions } from '../server.js';
import { emitStaticFile, waitForTasks } from '../lib/builder/build.js';
import {
  getManagedEntries,
  getManagedMain,
} from '../lib/plugins/vite-plugin-rsc-managed.js';
import { wakuDeployVercelPlugin } from './deploy/vercel/plugin.js';
import { wakuAllowServerPlugin } from './plugins/allow-server.js';
import { DIST_PUBLIC } from '../lib/builder/constants.js';
import { fsRouterTypegenPlugin } from '../lib/plugins/vite-plugin-fs-router-typegen.js';

const PKG_NAME = 'waku';

export type WakuPluginOptions = {
  flags?: WakuFlags | undefined;
  config?: Config | undefined;
};

export type WakuFlags = {
  'experimental-compress'?: boolean | undefined;
  'experimental-partial'?: boolean | undefined;
  'with-vercel'?: boolean | undefined;
};

export default function wakuPlugin(
  wakuPluginOptions?: WakuPluginOptions,
): PluginOption {
  const wakuConfig: Required<Config> = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    pagesDir: 'pages',
    apiDir: 'api',
    privateDir: 'private', // TODO?
    rscBase: 'RSC',
    middleware: [
      'waku/middleware/context',
      'waku/middleware/dev-server',
      'waku/middleware/handler',
    ],
    unstable_honoEnhancer: undefined,
    unstable_viteConfigs: undefined,
    vite: undefined,
    ...wakuPluginOptions?.config,
  };
  const wakuFlags: Record<string, unknown> = wakuPluginOptions?.flags ?? {};

  return [
    ...(wakuConfig.vite?.plugins ?? []),
    react(),
    wakuAllowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    rsc({
      keepUseCientProxy: true,
      ignoredPackageWarnings: [PKG_NAME],
      // by default, it copies only ".css" for security reasons.
      // this should expanded or exposed based on Waku's opinion.
      copyServerAssetsToClient: (fileName) =>
        fileName.endsWith('.css') ||
        fileName.endsWith('.txt') ||
        fileName.endsWith('.jpg') ||
        fileName.endsWith('.json'),
    }),
    {
      name: 'rsc:waku',
      async config(_config, env) {
        const toEnvironmentOption = (entry: string) =>
          ({
            build: {
              rollupOptions: {
                input: {
                  index: `${PKG_NAME}/vite-rsc/${entry}`,
                },
              },
            },
          }) satisfies EnvironmentOptions;

        let viteRscConfig: UserConfig = {
          define: {
            'import.meta.env.WAKU_CONFIG_BASE_PATH': JSON.stringify(
              wakuConfig.basePath,
            ),
            'import.meta.env.WAKU_CONFIG_RSC_BASE': JSON.stringify(
              wakuConfig.rscBase,
            ),
            'import.meta.env.WAKU_SERVE_STATIC': JSON.stringify(
              env.command === 'build',
            ),
          },
          environments: {
            client: toEnvironmentOption('entry.browser'),
            ssr: toEnvironmentOption('entry.ssr'),
            rsc: toEnvironmentOption('entry.rsc.node'),
          },
        };

        // backcompat for old vite config overrides
        // TODO: adding `plugins` here is not supported.
        viteRscConfig = mergeConfig(
          viteRscConfig,
          wakuConfig?.unstable_viteConfigs?.['common']?.() ?? {},
        );
        if (env.command === 'serve') {
          viteRscConfig = mergeConfig(
            viteRscConfig,
            wakuConfig?.unstable_viteConfigs?.['dev-main']?.() ?? {},
          );
        } else {
          viteRscConfig = mergeConfig(
            viteRscConfig,
            wakuConfig?.unstable_viteConfigs?.['build-server']?.() ?? {},
          );
        }

        if (wakuConfig.vite) {
          viteRscConfig = mergeConfig(viteRscConfig, {
            ...wakuConfig.vite,
            plugins: undefined,
          });
        }

        return viteRscConfig;
      },
      configEnvironment(name, config, _env) {
        // make @hiogawa/vite-rsc usable as a transitive dependency
        // https://github.com/hi-ogawa/vite-plugins/issues/968
        if (config.optimizeDeps?.include) {
          config.optimizeDeps.include = config.optimizeDeps.include.map(
            (name) => {
              if (name.startsWith('@hiogawa/vite-rsc/')) {
                name = `${PKG_NAME} > ${name}`;
              }
              return name;
            },
          );
        }

        config.build ??= {};
        config.build.outDir = `${wakuConfig.distDir}/${name}`;
        if (name === 'client') {
          config.build.outDir = `${wakuConfig.distDir}/${DIST_PUBLIC}`;
          if (wakuFlags['experimental-partial']) {
            config.build.emptyOutDir = false;
          }
        }

        return {
          resolve: {
            noExternal: [PKG_NAME],
          },
          optimizeDeps: {
            include: name === 'ssr' ? [`${PKG_NAME} > html-react-parser`] : [],
            exclude: [PKG_NAME, 'waku/minimal/client', 'waku/router/client'],
          },
          build: {
            // top-level-await in packages/waku/src/lib/middleware/context.ts
            target:
              config.build?.target ??
              (name !== 'client' ? 'esnext' : undefined),
          },
        };
      },
    },
    {
      name: 'rsc:waku:user-entries',
      // resolve user entries and fallbacks to "managed mode" if not found.
      async resolveId(source, _importer, options) {
        if (source === 'virtual:vite-rsc-waku/server-entry') {
          const resolved = await this.resolve(
            `/${wakuConfig.srcDir}/server-entry`,
            undefined,
            options,
          );
          return resolved ? resolved : '\0' + source;
        }
        if (source === 'virtual:vite-rsc-waku/client-entry') {
          const resolved = await this.resolve(
            `/${wakuConfig.srcDir}/client-entry`,
            undefined,
            options,
          );
          return resolved ? resolved : '\0' + source;
        }
      },
      load(id) {
        if (id === '\0virtual:vite-rsc-waku/server-entry') {
          return getManagedEntries(
            path.join(
              this.environment.config.root,
              `${wakuConfig.srcDir}/server-entry.js`,
            ),
            'src',
            {
              pagesDir: wakuConfig.pagesDir,
              apiDir: wakuConfig.apiDir,
            },
          );
        }
        if (id === '\0virtual:vite-rsc-waku/client-entry') {
          return getManagedMain();
        }
      },
    },
    createVirtualPlugin('vite-rsc-waku/middlewares', async function () {
      // minor tweak on middleware convention
      const pre: string[] = [];
      const post: string[] = [];
      const builtins: string[] = [];
      for (const file of wakuConfig.middleware) {
        if (file.startsWith('waku/')) {
          builtins.push(file);
          continue;
        }
        let id = file;
        if (file[0] === '.') {
          const resolved = await this.resolve(file);
          if (resolved) {
            id = resolved.id;
          }
        }
        if (builtins.includes('waku/middleware/handler')) {
          post.push(id);
        } else {
          pre.push(id);
        }
      }
      if (!builtins.includes('waku/middleware/handler')) {
        this.warn(
          "'waku/middleware/handler' is not found in 'config.middlewares', but it is always enabled.",
        );
      }
      if (post.length > 0) {
        this.warn(
          "Post middlewares after 'waku/middleware/handler' are currently ignored. " +
            JSON.stringify(post),
        );
      }

      let code = '';
      pre.forEach((file, i) => {
        code += `import __m_${i} from ${JSON.stringify(file)};\n`;
      });
      code += `export const middlewares = [`;
      code += pre.map((_, i) => `__m_${i}`).join(',\n');
      code += `];\n`;
      return code;
    }),
    createVirtualPlugin('vite-rsc-waku/hono-enhancer', async function () {
      if (!wakuConfig?.unstable_honoEnhancer) {
        return `export const honoEnhancer = (app) => app;`;
      }
      let id = wakuConfig.unstable_honoEnhancer;
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
        export const config = ${JSON.stringify({ ...wakuConfig, vite: undefined })};
        export const flags = ${JSON.stringify(wakuFlags)};
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
              import * as ReactClient from ${JSON.stringify(import.meta.resolve('@hiogawa/vite-rsc/browser'))};
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
      writeBundle: {
        order: 'post',
        sequential: true,
        async handler(_options, _bundle) {
          if (this.environment.name !== 'ssr') {
            return;
          }

          // import server entry
          const config = this.environment.getTopLevelConfig();
          const entryPath = path.join(
            config.environments.rsc!.build.outDir,
            'index.js',
          );
          const entry: typeof import('./entry.rsc.js') = await import(
            pathToFileURL(entryPath).href
          );

          // run `handleBuild`
          unstable_getBuildOptions().unstable_phase = 'emitStaticFiles';
          const buildConfigs = await entry.handleBuild();
          for await (const buildConfig of buildConfigs || []) {
            if (buildConfig.type === 'file') {
              emitStaticFile(
                config.root,
                { distDir: wakuConfig.distDir },
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
            this.environment.getTopLevelConfig().environments.rsc!.build.outDir,
            '__waku_set_platform_data.js',
          );
          fs.writeFileSync(platformDataFile, platformDataCode);
        },
      },
    },
    fsRouterTypegenPlugin({ srcDir: wakuConfig.srcDir }),
    !!wakuFlags['with-vercel'] && wakuDeployVercelPlugin(),
  ];
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
