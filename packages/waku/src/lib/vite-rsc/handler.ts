import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc/server';
import { buildMetadata } from 'virtual:vite-rsc-waku/build-metadata';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import notFoundHtml from 'virtual:vite-rsc-waku/not-found';
import { BUILD_METADATA_FILE, DIST_PUBLIC, DIST_SERVER } from '../constants.js';
import { unstable_setAllEnv } from '../env.js';
import type {
  Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter,
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_ProcessBuild as ProcessBuild,
  Unstable_ProcessRequest as ProcessRequest,
} from '../types.js';
import { sanitizeLog } from '../utils-isomorphic/log.js';
import { joinPath } from '../utils-isomorphic/path.js';
import { DEBUG_ID_HEADER } from '../utils-isomorphic/react-debug-channel.js';
import { encodeRscPath } from '../utils-isomorphic/rsc-path.js';
import { stringToStream } from '../utils-isomorphic/stream.js';
import { createRenderUtils } from '../utils-server/render.js';
import { getInput } from '../utils-server/request.js';

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<
    typeof import('../vite-entries/entry.ssr.js')
  >('ssr', 'index');
}

const toProcessRequest =
  (handleRequest: HandleRequest): ProcessRequest =>
  async (req) => {
    const temporaryReferences = createTemporaryReferenceSet();

    const debugId =
      (import.meta.env.DEV && req.headers.get(DEBUG_ID_HEADER.toLowerCase())) ||
      undefined;
    const debugChannelRegistry = globalThis.__WAKU_DEBUG_CHANNEL_REGISTRY__;
    const [createDebugChannel, finishDebugChannel] =
      (debugId && debugChannelRegistry?.get(debugId)) || [];
    if (debugId) {
      debugChannelRegistry?.delete(debugId);
    }

    const renderUtils = createRenderUtils({
      temporaryReferences,
      renderToReadableStream,
      loadSsrEntryModule,
      buildId: import.meta.env.WAKU_BUILD_ID ?? '',
      createDebugChannel,
      debugId,
      onError: (e) => {
        console.error('Error during rendering:', sanitizeLog(e));
      },
    });

    let res: Awaited<ReturnType<typeof handleRequest>>;
    try {
      const input = await getInput(
        req,
        config,
        temporaryReferences,
        decodeReply,
        decodeAction,
        decodeFormState,
        loadServerAction,
      );
      res = await handleRequest(input, {
        ...renderUtils,
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      });
    } catch (e) {
      if (e instanceof Response) {
        return e;
      }
      console.warn(sanitizeLog(e));
      return new Response('Internal Server Error', { status: 500 });
    } finally {
      finishDebugChannel?.();
    }

    if (res instanceof ReadableStream) {
      return new Response(res);
    } else if (res && res !== 'fallback') {
      return res;
    }

    // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
    const url = new URL(req.url);
    if (res === 'fallback' || (!res && url.pathname === '/')) {
      return renderUtils.renderHtmlFallback();
    }

    return null;
  };

const toProcessBuild =
  (handleBuild: HandleBuild): ProcessBuild =>
  async ({ emitFile, unstable_registerPrunableFile }) => {
    const errors: unknown[] = [];
    const renderUtils = createRenderUtils({
      temporaryReferences: undefined,
      renderToReadableStream,
      loadSsrEntryModule,
      buildId: import.meta.env.WAKU_BUILD_ID ?? '',
      onError: (e) => {
        errors.push(e);
      },
    });

    const getPublicFilePath = (fileName: string) => {
      const filePath = joinPath(DIST_PUBLIC, fileName);
      if (!filePath.startsWith(DIST_PUBLIC + '/')) {
        throw new Error('fileName escapes the public directory: ' + fileName);
      }
      return filePath;
    };

    await handleBuild({
      renderRsc: renderUtils.renderRsc,
      renderHtml: renderUtils.renderHtml,
      rscPath2pathname: (rscPath) =>
        joinPath(config.rscBase, encodeRscPath(rscPath)),
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      generateFile: async (fileName, body) => {
        await emitFile(
          getPublicFilePath(fileName),
          typeof body === 'string' ? stringToStream(body) : body,
        );
      },
      generateDefaultHtml: async (fileName, options) => {
        const response = await renderUtils.renderHtmlFallback(options);
        await emitFile(getPublicFilePath(fileName), response.body!);
      },
      unstable_registerPrunableFile,
    });
    if (errors.length) {
      throw new AggregateError(
        errors,
        'Render errors occurred while prerendering',
      );
    }
    await emitFile(
      joinPath(DIST_SERVER, BUILD_METADATA_FILE),
      stringToStream(
        `export const buildMetadata = new Map(${JSON.stringify(
          Array.from(buildMetadata),
        )});`,
      ),
    );
  };

export const createServerEntryAdapter: CreateServerEntryAdapter =
  (fn) => (handlers, options) => {
    const processRequest = toProcessRequest(handlers.handleRequest);
    const processBuild = toProcessBuild(handlers.handleBuild);
    return fn(
      {
        handlers,
        processRequest,
        processBuild,
        unstable_setAllEnv,
        config,
        isBuild,
        notFoundHtml,
      },
      options,
    );
  };
