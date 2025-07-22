import {
  mergeConfig,
  normalizePath,
  type Plugin,
  type PluginOption,
  type UserConfig,
} from 'vite';
import react from '@vitejs/plugin-react';
import rsc from '@vitejs/plugin-rsc';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
import {
  DIST_PUBLIC,
  EXTENSIONS,
  SRC_CLIENT_ENTRY,
  SRC_SERVER_ENTRY,
} from '../lib/builder/constants.js';
import { fsRouterTypegenPlugin } from '../lib/plugins/vite-plugin-fs-router-typegen.js';
import { wakuDeployNetlifyPlugin } from './deploy/netlify/plugin.js';
import { wakuDeployCloudflarePlugin } from './deploy/cloudflare/plugin.js';
import { wakuDeployPartykitPlugin } from './deploy/partykit/plugin.js';
import { wakuDeployDenoPlugin } from './deploy/deno/plugin.js';
import { wakuDeployAwsLambdaPlugin } from './deploy/aws-lambda/plugin.js';
import { filePathToFileURL, joinPath } from '../lib/utils/path.js';
import * as swc from '@swc/core';
import { parseOpts } from '../lib/utils/swc.js';

const PKG_NAME = 'waku';

export type WakuPluginOptions = {
  flags?: WakuFlags | undefined;
  config?: Config | undefined;
};

export type WakuFlags = {
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

export default function wakuPlugin(
  wakuPluginOptions?: WakuPluginOptions,
): PluginOption {
  const wakuConfig: Required<Config> = {
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
    ...wakuPluginOptions?.config,
  };
  const wakuFlags = wakuPluginOptions?.flags ?? {};
  let privatePath: string;
  let customServerEntry: string | undefined;

  const extraPlugins = [...(wakuConfig.vite?.plugins ?? [])];
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
    wakuAllowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    {
      // ignore file changes with a syntax error
      // cf. packages/waku/src/lib/plugins/vite-plugin-rsc-delegate.ts
      name: 'waku:ignore-rsc-reload-on-syntax-error',
      apply: 'serve',
      async hotUpdate(ctx) {
        if (ctx.modules.length > 0 && this.environment.name === 'rsc') {
          const ext = path.extname(ctx.file);
          if (EXTENSIONS.includes(ext)) {
            const code = await ctx.read();
            try {
              swc.parseSync(code, parseOpts(ext));
            } catch {
              return [];
            }
          }
        }
      },
    },
    rsc({
      keepUseCientProxy: true,
      ignoredPackageWarnings: [PKG_NAME, 'waku-jotai'],
      frameworkPackages: ['react', 'waku'],
    }),
    {
      name: 'rsc:waku',
      async config(_config, env) {
        const __dirname = fileURLToPath(new URL('.', import.meta.url));
        let viteRscConfig: UserConfig = {
          define: {
            'import.meta.env.WAKU_CONFIG_BASE_PATH': JSON.stringify(
              wakuConfig.basePath,
            ),
            'import.meta.env.WAKU_CONFIG_RSC_BASE': JSON.stringify(
              wakuConfig.rscBase,
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
                  `${wakuConfig.srcDir}/${SRC_CLIENT_ENTRY}.*`,
                  `${wakuConfig.srcDir}/${SRC_SERVER_ENTRY}.*`,
                  `${wakuConfig.srcDir}/${wakuConfig.pagesDir}/**/*.*`,
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
                    index: path.join(__dirname, 'entry.rsc.node.js'),
                  },
                },
              },
            },
          },
        };

        // backcompat for old vite config overrides
        // Note that adding `plugins` here is not supported and
        // such plugins should be moved to `wakuConfig.vite`.
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
      configEnvironment(name, config, env) {
        // make @vitejs/plugin-rsc usable as a transitive dependency
        // https://github.com/hi-ogawa/vite-plugins/issues/968
        if (config.optimizeDeps?.include) {
          config.optimizeDeps.include = config.optimizeDeps.include.map(
            (name) => {
              if (name.startsWith('@vitejs/plugin-rsc/')) {
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
            noExternal: env.command === 'build' ? true : [PKG_NAME],
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
      configResolved(config) {
        privatePath = joinPath(config.root, wakuConfig.privateDir);
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
            `/${wakuConfig.srcDir}/${SRC_SERVER_ENTRY}`,
            undefined,
            options,
          );
          customServerEntry = resolved?.id;
          return resolved ? resolved : '\0' + source;
        }
        if (source === 'virtual:vite-rsc-waku/client-entry') {
          const resolved = await this.resolve(
            `/${wakuConfig.srcDir}/${SRC_CLIENT_ENTRY}`,
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
    {
      name: 'rsc:private-dir',
      load(id) {
        if (id.startsWith(privatePath)) {
          throw new Error('Private file access is not allowed');
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
    fsRouterTypegenPlugin({ srcDir: wakuConfig.srcDir }),
    !!(
      wakuFlags['with-vercel'] ||
      wakuFlags['with-vercel-static'] ||
      process.env.VERCEL
    ) &&
      wakuDeployVercelPlugin({
        wakuConfig,
        serverless: !!wakuFlags['with-vercel'],
      }),
    !!(
      wakuFlags['with-netlify'] ||
      wakuFlags['with-netlify-static'] ||
      process.env.NETLIFY
    ) &&
      wakuDeployNetlifyPlugin({
        wakuConfig,
        serverless: !!wakuFlags['with-netlify'],
      }),
    !!wakuFlags['with-cloudflare'] &&
      wakuDeployCloudflarePlugin({ wakuConfig }),
    !!wakuFlags['with-partykit'] && wakuDeployPartykitPlugin({ wakuConfig }),
    !!wakuFlags['with-deno'] && wakuDeployDenoPlugin({ wakuConfig }),
    !!wakuFlags['with-aws-lambda'] &&
      wakuDeployAwsLambdaPlugin({
        wakuConfig,
        streaming: process.env.DEPLOY_AWS_LAMBDA_STREAMING === 'true',
      }),
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
