import { Readable, Writable } from 'node:stream';
import { Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createServer as createViteServer } from 'vite';
import viteReact from '@vitejs/plugin-react';

import type { EntriesDev } from '../../server.js';
import { resolveConfig } from '../config.js';
import {
  joinPath,
  fileURLToFilePath,
  encodeFilePathToAbsolute,
  decodeFilePathFromAbsolute,
} from '../utils/path.js';
import { patchReactRefresh } from '../plugins/patch-react-refresh.js';
import { nonjsResolvePlugin } from '../plugins/vite-plugin-nonjs-resolve.js';
import { devCommonJsPlugin } from '../plugins/vite-plugin-dev-commonjs.js';
import {
  rscTransformPlugin,
  transformServer,
} from '../plugins/vite-plugin-rsc-transform.js';
import { rscIndexPlugin } from '../plugins/vite-plugin-rsc-index.js';
import { rscHmrPlugin, hotUpdate } from '../plugins/vite-plugin-rsc-hmr.js';
import type { HotUpdatePayload } from '../plugins/vite-plugin-rsc-hmr.js';
import { rscEnvPlugin } from '../plugins/vite-plugin-rsc-env.js';
import { rscPrivatePlugin } from '../plugins/vite-plugin-rsc-private.js';
import {
  // HACK depending on these constants is not ideal
  SRC_ENTRIES,
  SRC_MAIN,
  rscManagedPlugin,
} from '../plugins/vite-plugin-rsc-managed.js';
import { rscDelegatePlugin } from '../plugins/vite-plugin-rsc-delegate.js';
import { mergeUserViteConfig } from '../utils/merge-vite-config.js';
import type { ClonableModuleNode, Middleware } from './types.js';

// TODO there is huge room for refactoring in this file

// For react-server-dom-webpack/server.edge
(globalThis as any).AsyncLocalStorage = AsyncLocalStorage;

const createStreamPair = (): [Writable, Promise<ReadableStream | null>] => {
  let controller: ReadableStreamDefaultController | undefined;
  const readable = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = undefined;
    },
  });
  let resolve: (value: ReadableStream | null) => void;
  const promise = new Promise<ReadableStream | null>((r) => (resolve = r));
  let hasData = false;
  const writable = new Writable({
    write(chunk, encoding, callback) {
      if (encoding !== ('buffer' as any)) {
        throw new Error('Unknown encoding');
      }
      if (controller) {
        controller.enqueue(chunk);
        if (!hasData) {
          hasData = true;
          resolve(readable);
        }
      }
      callback();
    },
    final(callback) {
      if (controller) {
        controller.close();
        if (!hasData) {
          resolve(null);
        }
      }
      callback();
    },
  });
  return [writable, promise];
};

const hotUpdateCallbackSet = new Set<(payload: HotUpdatePayload) => void>();
const registerHotUpdateCallback = (fn: (payload: HotUpdatePayload) => void) =>
  hotUpdateCallbackSet.add(fn);
const hotUpdateCallback = (payload: HotUpdatePayload) =>
  hotUpdateCallbackSet.forEach((fn) => fn(payload));

const createMainViteServer = (
  configPromise: ReturnType<typeof resolveConfig>,
) => {
  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      // Since we have multiple instances of vite, different ones might overwrite the others' cache.
      cacheDir: 'node_modules/.vite/waku-dev-server-main',
      base: config.basePath,
      plugins: [
        patchReactRefresh(viteReact()),
        nonjsResolvePlugin(),
        rscEnvPlugin({ config }),
        rscPrivatePlugin(config),
        rscManagedPlugin(config),
        rscIndexPlugin(config),
        rscTransformPlugin({ isClient: true, isBuild: false }),
        rscHmrPlugin(),
      ],
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react-dom'],
        exclude: ['waku'],
        entries: [
          `${config.srcDir}/${SRC_ENTRIES}.*`,
          // HACK hard-coded "pages"
          `${config.srcDir}/pages/**/*.*`,
        ],
      },
      ssr: {
        external: ['waku'],
      },
      server: { middlewareMode: true },
    });
    const vite = await createViteServer(mergedViteConfig);
    registerHotUpdateCallback((payload) => hotUpdate(vite, payload));
    return vite;
  });

  const loadServerFileMain = async (fileURL: string) => {
    const vite = await vitePromise;
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
  };

  const transformIndexHtml = async (pathname: string) => {
    const vite = await vitePromise;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let headSent = false;
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        if (!headSent) {
          headSent = true;
          let data = decoder.decode(chunk);
          // FIXME without removing async, Vite will move it
          // to the proxy cache, which breaks __WAKU_PUSH__.
          data = data.replace(/<script type="module" async>/, '<script>');
          return new Promise<void>((resolve, reject) => {
            vite
              .transformIndexHtml(pathname, data)
              .then((result) => {
                controller.enqueue(encoder.encode(result));
                resolve();
              })
              .catch(reject);
          });
        }
        controller.enqueue(chunk);
      },
      flush() {
        if (!headSent) {
          throw new Error('head not yet sent');
        }
      },
    });
  };

  const willBeHandledLater = async (pathname: string) => {
    const vite = await vitePromise;
    try {
      const result = await vite.transformRequest(pathname);
      return !!result;
    } catch {
      return false;
    }
  };

  return {
    vitePromise,
    loadServerFileMain,
    transformIndexHtml,
    willBeHandledLater,
  };
};

const createRscViteServer = (
  configPromise: ReturnType<typeof resolveConfig>,
) => {
  const dummyServer = new Server(); // FIXME we hope to avoid this hack

  const vitePromise = configPromise.then(async (config) => {
    const mergedViteConfig = await mergeUserViteConfig({
      // Since we have multiple instances of vite, different ones might overwrite the others' cache.
      cacheDir: 'node_modules/.vite/waku-dev-server-rsc',
      plugins: [
        viteReact(),
        nonjsResolvePlugin(),
        devCommonJsPlugin(),
        rscEnvPlugin({}),
        rscPrivatePlugin({ privateDir: config.privateDir, hotUpdateCallback }),
        rscManagedPlugin({ basePath: config.basePath, srcDir: config.srcDir }),
        rscTransformPlugin({ isClient: false, isBuild: false }),
        rscDelegatePlugin(hotUpdateCallback),
      ],
      optimizeDeps: {
        include: ['react-server-dom-webpack/client', 'react-dom'],
        exclude: ['waku'],
        entries: [
          `${config.srcDir}/${SRC_ENTRIES}.*`,
          // HACK hard-coded "pages"
          `${config.srcDir}/pages/**/*.*`,
        ],
      },
      ssr: {
        resolve: {
          conditions: ['react-server', 'workerd'],
          externalConditions: ['react-server', 'workerd'],
        },
        noExternal: /^(?!node:)/,
        optimizeDeps: {
          include: [
            'react-server-dom-webpack/server.edge',
            'react',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
          ],
          esbuildOptions: {
            plugins: [
              {
                name: 'transform-rsc',
                setup(build) {
                  build.onLoad({ filter: /.*/ }, async (args) => {
                    const text = await readFile(args.path, 'utf8');
                    const code = transformServer(
                      text,
                      args.path,
                      (id) => id,
                      (id) => id,
                    );
                    if (code) {
                      return { contents: code };
                    }
                  });
                },
              },
            ],
          },
        },
      },
      appType: 'custom',
      server: { middlewareMode: true, hmr: { server: dummyServer } },
    });
    const vite = await createViteServer(mergedViteConfig);
    return vite;
  });

  const loadServerFileRsc = async (fileURL: string) => {
    const vite = await vitePromise;
    return vite.ssrLoadModule(fileURLToFilePath(fileURL));
  };

  const loadServerModuleRsc = async (id: string) => {
    const vite = await vitePromise;
    return vite.ssrLoadModule(id);
  };

  const loadEntriesDev = async (config: { srcDir: string }) => {
    const vite = await vitePromise;
    const filePath = joinPath(vite.config.root, config.srcDir, SRC_ENTRIES);
    return vite.ssrLoadModule(filePath) as Promise<EntriesDev>;
  };

  const resolveClientEntry = (
    id: string,
    config: { rootDir: string; basePath: string },
    initialModules: ClonableModuleNode[],
  ) => {
    let file = id.startsWith('file://')
      ? decodeFilePathFromAbsolute(fileURLToFilePath(id))
      : id;
    for (const moduleNode of initialModules) {
      if (moduleNode.file === file) {
        return moduleNode.url;
      }
    }
    if (file.startsWith(config.rootDir)) {
      file = file.slice(config.rootDir.length + 1); // '+ 1' to remove '/'
    } else {
      file = '@fs' + encodeFilePathToAbsolute(file);
    }
    return config.basePath + file;
  };

  return {
    loadServerFileRsc,
    loadServerModuleRsc,
    loadEntriesDev,
    resolveClientEntry,
  };
};

export const devServer: Middleware = (options) => {
  if (options.cmd !== 'dev') {
    // pass through if not dev command
    return (_ctx, next) => next();
  }

  (globalThis as any).__WAKU_PRIVATE_ENV__ = options.env || {};
  const configPromise = resolveConfig(options.config);

  const {
    vitePromise,
    loadServerFileMain,
    transformIndexHtml,
    willBeHandledLater,
  } = createMainViteServer(configPromise);

  const {
    loadServerFileRsc,
    loadServerModuleRsc,
    loadEntriesDev,
    resolveClientEntry,
  } = createRscViteServer(configPromise);

  let initialModules: ClonableModuleNode[];

  return async (ctx, next) => {
    const [{ middleware: _removed, ...config }, vite] = await Promise.all([
      configPromise,
      vitePromise,
    ]);

    if (!initialModules) {
      // pre-process the mainJs file to see which modules are being sent to the browser by vite
      // and using the same modules if possible in the bundlerConfig in the stream
      const mainJs = `${config.basePath}${config.srcDir}/${SRC_MAIN}`;
      await vite.transformRequest(mainJs);
      const resolved = await vite.pluginContainer.resolveId(mainJs);
      const resolvedModule = vite.moduleGraph.idToModuleMap.get(resolved!.id)!;
      await Promise.all(
        [...resolvedModule.importedModules].map(({ id }) =>
          id ? vite.warmupRequest(id) : null,
        ),
      );

      initialModules = Array.from(vite.moduleGraph.idToModuleMap.values()).map(
        (m) => ({ url: m.url, file: m.file! }),
      );
    }

    ctx.unstable_devServer = {
      rootDir: vite.config.root,
      resolveClientEntryDev: (id: string) =>
        resolveClientEntry(
          id,
          {
            rootDir: vite.config.root,
            basePath: config.basePath,
          },
          initialModules,
        ),
      loadServerFileRsc,
      loadServerModuleRsc,
      loadEntriesDev,
      loadServerFileMain,
      transformIndexHtml,
      willBeHandledLater,
    };

    await next();
    if (ctx.res.body) {
      return;
    }

    const viteUrl = ctx.req.url.toString().slice(ctx.req.url.origin.length);
    const viteReq: any = Readable.fromWeb(ctx.req.body as any);
    viteReq.method = ctx.req.method;
    viteReq.url = viteUrl;
    viteReq.headers = ctx.req.headers;
    const [writable, readablePromise] = createStreamPair();
    const viteRes: any = writable;
    Object.defineProperty(viteRes, 'statusCode', {
      set(code) {
        ctx.res.status = code;
      },
    });
    const headers = new Map<string, string>();
    viteRes.setHeader = (name: string, value: string) => {
      headers.set(name, value);
      ctx.res.headers = {
        ...ctx.res.headers,
        [name]: String(value),
      };
    };
    viteRes.getHeader = (name: string) => headers.get(name);
    viteRes.writeHead = (code: number, headers?: Record<string, string>) => {
      ctx.res.status = code;
      for (const [name, value] of Object.entries(headers || {})) {
        viteRes.setHeader(name, value);
      }
    };
    vite.middlewares(viteReq, viteRes);
    const body = await readablePromise;
    if (body) {
      ctx.res.body = body;
    }
  };
};
