import type { ReactNode, FunctionComponent, ComponentProps } from 'react';
import type { ViteDevServer } from 'vite';

import type { ResolvedConfig } from '../../config.js';
import { defineEntries } from '../../server.js';
import { concatUint8Arrays } from '../utils/stream.js';
import {
  decodeFilePathFromAbsolute,
  joinPath,
  filePathToFileURL,
  fileURLToFilePath,
} from '../utils/path.js';
import { renderRscWithWorker } from './worker-api.js';
import { renderRsc } from './rsc-renderer.js';
import { hasStatusCode, deepFreeze } from './utils.js';

const loadReact = async (config: ResolvedConfig, isDev: boolean) => {
  if (!isDev) {
    return (
      await import(
        filePathToFileURL(
          joinPath(
            config.rootDir,
            config.distDir,
            config.publicDir,
            config.assetsDir,
            'react.js',
          ),
        )
      )
    ).default;
  }
  return import('react');
};

const loadRDServer = async (config: ResolvedConfig, isDev: boolean) => {
  if (!isDev) {
    return (
      await import(
        filePathToFileURL(
          joinPath(
            config.rootDir,
            config.distDir,
            config.publicDir,
            config.assetsDir,
            'rd-server.js',
          ),
        )
      )
    ).default;
  }
  return import('react-dom/server.edge');
};

const loadRSDWClient = async (config: ResolvedConfig, isDev: boolean) => {
  if (!isDev) {
    return (
      await import(
        filePathToFileURL(
          joinPath(
            config.rootDir,
            config.distDir,
            config.publicDir,
            config.assetsDir,
            'rsdw-client.js',
          ),
        )
      )
    ).default;
  }
  return import('react-server-dom-webpack/client.edge');
};

const loadWakuClient = async (config: ResolvedConfig, isDev: boolean) => {
  if (!isDev) {
    return import(
      filePathToFileURL(
        joinPath(
          config.rootDir,
          config.distDir,
          config.publicDir,
          config.assetsDir,
          'waku-client.js',
        ),
      )
    );
  }
  return import('waku/client');
};

// HACK for react-server-dom-webpack without webpack
const moduleCache = new Map();
(globalThis as any).__webpack_chunk_load__ ||= async (id: string) => {
  const [fileURL, mode] = id.split('#');
  const m = await loadServerFile(fileURL!, mode === 'dev');
  moduleCache.set(id, m);
};
(globalThis as any).__webpack_require__ ||= (id: string) => moduleCache.get(id);

type Entries = {
  default: ReturnType<typeof defineEntries>;
};

let lastViteServer: ViteDevServer | undefined;
const getViteServer = async () => {
  if (lastViteServer) {
    return lastViteServer;
  }
  const { Server } = await import('node:http');
  const dummyServer = new Server(); // FIXME we hope to avoid this hack
  const { createServer: viteCreateServer } = await import('vite');
  const { nonjsResolvePlugin } = await import(
    '../plugins/vite-plugin-nonjs-resolve.js'
  );
  const viteServer = await viteCreateServer({
    plugins: [nonjsResolvePlugin()],
    ssr: {
      external: ['react', 'react-server-dom-webpack'],
      noExternal: /^(?!node:)/,
    },
    appType: 'custom',
    server: { middlewareMode: true, hmr: { server: dummyServer } },
  });
  await viteServer.watcher.close(); // TODO watch: null
  await viteServer.ws.close();
  lastViteServer = viteServer;
  return viteServer;
};

const loadServerFile = async (fileURL: string, isDev: boolean) => {
  if (!isDev) {
    return import(fileURL);
  }
  const vite = await getViteServer();
  return vite.ssrLoadModule(fileURLToFilePath(fileURL));
};

const getEntriesFileURL = (config: ResolvedConfig, isDev: boolean) => {
  const filePath = joinPath(
    config.rootDir,
    isDev ? config.srcDir : config.distDir,
    config.entriesJs,
  );
  return filePathToFileURL(filePath);
};

const fakeFetchCode = `
Promise.resolve({
  ok: true,
  body: new ReadableStream({
    start(c) {
      const f = (s) => new TextEncoder().encode(decodeURI(s));
      globalThis.__WAKU_PUSH__ = (s) => s ? c.enqueue(f(s)) : c.close();
    }
  })
})
`
  .split('\n')
  .map((line) => line.trim())
  .join('');

const injectRscPayload = (readable: ReadableStream, input: string) => {
  const chunks: Uint8Array[] = [];
  let closed = false;
  let notify: (() => void) | undefined;
  const copied = readable.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        chunks.push(chunk);
        notify?.();
        controller.enqueue(chunk);
      },
      flush() {
        closed = true;
        notify?.();
      },
    }),
  );
  const modifyHead = (data: string) => {
    const matchPrefetched = data.match(
      // HACK This is very brittle
      /(.*)<script>\nglobalThis\.__WAKU_PREFETCHED__ = {\n(.*?)\n};(.*)/s,
    );
    let prefetchedLines: string[] = [];
    if (matchPrefetched) {
      prefetchedLines = matchPrefetched[2]!.split('\n');
      data = matchPrefetched[1] + '<script>\n' + matchPrefetched[3];
    }
    const closingHeadIndex = data.indexOf('</head>');
    if (closingHeadIndex === -1) {
      throw new Error('closing head not found');
    }
    data =
      data.slice(0, closingHeadIndex) +
      `
<script>
globalThis.__WAKU_PREFETCHED__ = {
${prefetchedLines
  .filter((line) => !line.startsWith(`  '${input}':`))
  .join('\n')}
  '${input}': ${fakeFetchCode},
};
globalThis.__WAKU_SSR_ENABLED__ = true;
</script>
` +
      data.slice(closingHeadIndex);
    return data;
  };
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const getScripts = (): string => {
    const scripts = chunks.splice(0).map(
      (chunk) =>
        `
<script>globalThis.__WAKU_PUSH__("${encodeURI(
          decoder.decode(chunk),
        )}")</script>`,
    );
    if (closed) {
      scripts.push(
        `
<script>globalThis.__WAKU_PUSH__()</script>`,
      );
    }
    return scripts.join('');
  };
  const interleave = (
    preamble: string,
    intermediate: string,
    postamble: string,
  ) => {
    let preambleSent = false;
    return new TransformStream({
      transform(chunk, controller) {
        if (!(chunk instanceof Uint8Array)) {
          throw new Error('Unknown chunk type');
        }
        if (!preambleSent) {
          preambleSent = true;
          controller.enqueue(
            concatUint8Arrays([
              encoder.encode(modifyHead(preamble)),
              chunk,
              encoder.encode(intermediate),
            ]),
          );
          notify = () => controller.enqueue(encoder.encode(getScripts()));
          notify();
          return;
        }
        controller.enqueue(chunk);
      },
      flush(controller) {
        if (!preambleSent) {
          throw new Error('preamble not yet sent');
        }
        if (!closed) {
          return new Promise<void>((resolve) => {
            notify = () => {
              controller.enqueue(encoder.encode(getScripts()));
              if (closed) {
                controller.enqueue(encoder.encode(postamble));
                resolve();
              }
            };
          });
        }
        controller.enqueue(encoder.encode(postamble));
      },
    });
  };
  return [copied, interleave] as const;
};

// HACK for now, do we want to use HTML parser?
const rectifyHtml = () => {
  const pending: Uint8Array[] = [];
  const decoder = new TextDecoder();
  return new TransformStream({
    transform(chunk, controller) {
      if (!(chunk instanceof Uint8Array)) {
        throw new Error('Unknown chunk type');
      }
      pending.push(chunk);
      if (/<\/\w+>$/.test(decoder.decode(chunk))) {
        controller.enqueue(concatUint8Arrays(pending.splice(0)));
      }
    },
    flush(controller) {
      if (!pending.length) {
        controller.enqueue(concatUint8Arrays(pending.splice(0)));
      }
    },
  });
};

export const renderHtml = async <Context>(
  config: ResolvedConfig,
  isDev: boolean,
  pathStr: string,
  htmlStr: string, // Hope stream works, but it'd be too tricky
  context: Context,
): Promise<readonly [ReadableStream, Context] | null> => {
  const [
    { createElement },
    { renderToReadableStream },
    { createFromReadableStream },
    { ServerRoot, Slot },
  ] = await Promise.all([
    loadReact(config, isDev),
    loadRDServer(config, isDev),
    loadRSDWClient(config, isDev),
    loadWakuClient(config, isDev),
  ]);
  const entriesFileURL = getEntriesFileURL(config, isDev);
  const {
    default: { getSsrConfig },
  } = await (loadServerFile(entriesFileURL, isDev) as Promise<Entries>);
  const ssrConfig = await getSsrConfig?.(pathStr);
  if (!ssrConfig) {
    return null;
  }
  let stream: ReadableStream;
  let nextCtx: Context;
  try {
    if (!isDev) {
      stream = await renderRsc({
        config,
        input: ssrConfig.input,
        method: 'GET',
        context,
        isDev: false,
      });
      deepFreeze(context);
      nextCtx = context;
    } else {
      [stream, nextCtx] = await renderRscWithWorker({
        input: ssrConfig.input,
        method: 'GET',
        contentType: undefined,
        config,
        context,
      });
    }
  } catch (e) {
    if (hasStatusCode(e) && e.statusCode === 404) {
      return null;
    }
    throw e;
  }
  const { splitHTML } = config.ssr;
  const moduleMap = new Proxy(
    {} as Record<
      string,
      Record<
        string,
        {
          id: string;
          chunks: string[];
          name: string;
        }
      >
    >,
    {
      get(_target, filePath: string) {
        return new Proxy(
          {},
          {
            get(_target, name: string) {
              const file = filePath.slice(config.basePath.length);
              if (isDev) {
                const filePath = file.startsWith('@fs/')
                  ? decodeFilePathFromAbsolute(file.slice('@fs'.length))
                  : joinPath(config.rootDir, file);
                const wakuDist = joinPath(
                  fileURLToFilePath(import.meta.url),
                  '../../..',
                );
                if (filePath.startsWith(wakuDist)) {
                  const id =
                    'waku' +
                    filePath.slice(wakuDist.length).replace(/\.\w+$/, '');
                  return { id, chunks: [id], name };
                }
                const id = filePathToFileURL(filePath) + '#dev';
                return { id, chunks: [id], name };
              }
              // !isDev
              const id = filePathToFileURL(
                joinPath(
                  config.rootDir,
                  config.distDir,
                  config.publicDir,
                  file,
                ),
              );
              return { id, chunks: [id], name };
            },
          },
        );
      },
    },
  );
  const [copied, interleave] = injectRscPayload(stream, ssrConfig.input);
  const elements: Promise<Record<string, ReactNode>> = createFromReadableStream(
    copied,
    {
      ssrManifest: { moduleMap, moduleLoading: null },
    },
  );
  const readable = (
    await renderToReadableStream(
      createElement(
        ServerRoot as FunctionComponent<
          Omit<ComponentProps<typeof ServerRoot>, 'children'>
        >,
        { elements },
        ssrConfig.unstable_render({ createElement, Slot }),
      ),
      {
        onError(err: unknown) {
          console.error(err);
        },
      },
    )
  )
    .pipeThrough(rectifyHtml())
    .pipeThrough(interleave(...splitHTML(htmlStr)));
  return [readable, nextCtx];
};
