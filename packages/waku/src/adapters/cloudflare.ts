import type { MiddlewareHandler } from 'hono';
import { Hono } from 'hono/tiny';
import {
  unstable_createServerEntryAdapter as createServerEntryAdapter,
  unstable_startPreviewServer as startPreviewServer,
} from 'waku/adapter-builders';
import {
  unstable_constants as constants,
  unstable_consumeMultiplexedStream as consumeMultiplexedStream,
  unstable_honoMiddleware as honoMiddleware,
  unstable_produceMultiplexedStream as produceMultiplexedStream,
} from 'waku/internals';
import type { BuildOptions } from './cloudflare-build-enhancer.js';

const { DIST_PUBLIC, DIST_SERVER, BUILD_METADATA_FILE } = constants;
const METADATA_KEY = `${DIST_SERVER}/${BUILD_METADATA_FILE}`;
const { contextMiddleware, rscMiddleware, middlewareRunner } = honoMiddleware;

const DO_NOT_BUNDLE = '';

const PRUNABLE_LIST_KEY = '\0__prunable_list__';

const stringToStream = (str: string): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(str));
      controller.close();
    },
  });
};

const streamToString = async (
  stream: ReadableStream<Uint8Array>,
): Promise<string> => {
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  let result = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
};

function isWranglerDev(req: Request): boolean {
  // This header seems to only be set for production cloudflare workers
  return !req.headers.get('cf-visitor');
}

function removeGzipEncoding(res: Response): Response {
  const contentType = res.headers.get('content-type');
  if (
    !contentType ||
    contentType.includes('text/html') ||
    contentType.includes('text/plain')
  ) {
    const headers = new Headers(res.headers);
    headers.set('content-encoding', 'Identity');
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
  return res;
}

export default createServerEntryAdapter(
  (
    { processRequest, processBuild, setAllEnv, config, notFoundHtml },
    options?: {
      static?: boolean;
      handlers?: Record<string, unknown>;
      assetsDir?: string;
      middlewareFns?: (() => MiddlewareHandler)[];
      middlewareModules?: Record<string, () => Promise<unknown>>;
      internalPathToBuildStaticFiles?: string;
    },
  ) => {
    const {
      middlewareFns = [],
      middlewareModules = {},
      internalPathToBuildStaticFiles = '__waku_internal_build_static_files',
    } = options || {};
    const app = new Hono();
    app.notFound((c) => {
      if (notFoundHtml) {
        return c.html(notFoundHtml, 404);
      }
      return c.text('404 Not Found', 404);
    });
    app.use(contextMiddleware());
    for (const middlewareFn of middlewareFns) {
      app.use(middlewareFn());
    }
    app.use(middlewareRunner(middlewareModules as never));
    app.use(rscMiddleware({ processRequest }));
    const buildOptions: BuildOptions = {
      srcDir: config.srcDir,
      distDir: config.distDir,
      DIST_PUBLIC,
      serverless: !options?.static,
    };

    const buildBody = () =>
      produceMultiplexedStream(async (emitFile) => {
        const prunableFiles = new Set<string>();
        await processBuild({
          emitFile,
          unstable_registerPrunableFile: (srcPath) => {
            prunableFiles.add(srcPath);
          },
        });
        if (prunableFiles.size > 0) {
          await emitFile(
            PRUNABLE_LIST_KEY,
            stringToStream(JSON.stringify(Array.from(prunableFiles))),
          );
        }
      });

    const fetchFn = async (req: Request) => {
      if (new URL(req.url).pathname === `/${internalPathToBuildStaticFiles}`) {
        return new Response(buildBody());
      }
      let cloudflareContext;
      try {
        cloudflareContext = await import(
          /* @vite-ignore */ DO_NOT_BUNDLE + 'cloudflare:workers'
        );
      } catch {
        // Not in a Cloudflare environment
      }
      let res: Response | Promise<Response>;
      if (cloudflareContext) {
        const { env, waitUntil, passThroughOnException } = cloudflareContext;
        res = app.fetch(req, env, {
          waitUntil,
          passThroughOnException,
          props: undefined,
        });
      } else {
        res = app.fetch(req);
      }
      // Workaround https://github.com/cloudflare/workers-sdk/issues/6577
      if (import.meta.env?.PROD && isWranglerDev(req)) {
        if ('then' in res) {
          res = res.then((res) => removeGzipEncoding(res));
        } else {
          res = removeGzipEncoding(res);
        }
      }
      return res;
    };

    return {
      fetch: fetchFn,
      build: async (utils) => {
        const server = await startPreviewServer();
        // Fallback middleware for the case without @cloudflare/vite-plugin
        server.middlewares.use(async (_req, res, next) => {
          try {
            const { Readable } = await import(
              /* @vite-ignore */ DO_NOT_BUNDLE + 'node:stream'
            );
            Readable.fromWeb(buildBody() as never).pipe(res);
          } catch (err) {
            next(err);
          }
        });
        const response = await fetch(
          server.baseUrl + internalPathToBuildStaticFiles,
        );
        let metadataContent: string | undefined;
        await consumeMultiplexedStream(response.body!, async (key, stream) => {
          if (key === PRUNABLE_LIST_KEY) {
            const text = await streamToString(stream);
            for (const srcPath of JSON.parse(text) as string[]) {
              utils.unstable_registerPrunableFile(srcPath);
            }
            return;
          }
          if (key === METADATA_KEY) {
            metadataContent = await streamToString(stream);
            return;
          }
          await utils.emitFile(key, stream);
        });
        if (metadataContent !== undefined) {
          await utils.emitFile(METADATA_KEY, stringToStream(metadataContent));
        }
        await server.close();
      },
      buildOptions,
      buildEnhancers: ['waku/adapters/cloudflare-build-enhancer'],
      defaultExport: {
        ...options?.handlers,
        fetch(req: Request, env: Record<string, string>) {
          setAllEnv(env);
          return fetchFn(req);
        },
      },
    };
  },
);
