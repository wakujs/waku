import {
  createFromReadableStream,
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc';
import { buildMetadata } from 'virtual:vite-rsc-waku/build-metadata';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import notFoundHtml from 'virtual:vite-rsc-waku/not-found';
import { BUILD_METADATA_FILE, DIST_PUBLIC, DIST_SERVER } from '../constants.js';
import { INTERNAL_runWithContext } from '../context.js';
import type {
  Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter,
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_ProcessBuild as ProcessBuild,
  Unstable_ProcessRequest as ProcessRequest,
} from '../types.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { joinPath } from '../utils/path.js';
import { createRenderUtils } from '../utils/render.js';
import { getDecodedPathname, getRscInput } from '../utils/request.js';
import { encodeRscPath } from '../utils/rsc-path.js';
import { stringToStream } from '../utils/stream.js';

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<typeof import('./ssr.js')>(
    'ssr',
    'index',
  );
}

const toProcessRequest =
  (handleRequest: HandleRequest): ProcessRequest =>
  async (req) => {
    const temporaryReferences = createTemporaryReferenceSet();

    const input = {
      pathname: getDecodedPathname(req, config),
      req,
    };

    const renderUtils = createRenderUtils(
      temporaryReferences,
      renderToReadableStream,
      createFromReadableStream,
      loadSsrEntryModule,
    );

    let res: Awaited<ReturnType<typeof handleRequest>>;
    try {
      res = await handleRequest(input, {
        ...renderUtils,
        getRscInput: (req) =>
          getRscInput(
            req,
            config,
            temporaryReferences,
            decodeReply,
            decodeAction,
            decodeFormState,
            loadServerAction,
          ),
        loadBuildMetadata: async (key: string) => buildMetadata.get(key),
      });
    } catch (e) {
      const info = getErrorInfo(e);
      const status = info?.status || 500;
      const body = stringToStream(
        (e as { message?: string } | undefined)?.message || String(e),
      );
      const headers: { location?: string } = {};
      if (info?.location) {
        headers.location = info.location;
      }
      return new Response(body, { status, headers });
    }

    if (res instanceof ReadableStream) {
      return new Response(res);
    } else if (res && res !== 'fallback') {
      return res;
    }

    // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
    const url = new URL(req.url);
    if (res === 'fallback' || (!res && url.pathname === '/')) {
      const { renderHtmlFallback } = await loadSsrEntryModule();
      const htmlFallbackStream = await renderHtmlFallback();
      const headers = { 'content-type': 'text/html; charset=utf-8' };
      return new Response(htmlFallbackStream, { headers });
    }

    return null;
  };

const toProcessBuild =
  (handleBuild: HandleBuild): ProcessBuild =>
  async (emitFile) => {
    const renderUtils = createRenderUtils(
      undefined,
      renderToReadableStream,
      createFromReadableStream,
      loadSsrEntryModule,
    );

    let fallbackHtml: string | undefined;
    const getFallbackHtml = async () => {
      if (!fallbackHtml) {
        const ssrEntryModule = await loadSsrEntryModule();
        fallbackHtml = await ssrEntryModule.renderHtmlFallback();
      }
      return fallbackHtml;
    };

    const buildMetadata = new Map<string, string>();

    await handleBuild({
      renderRsc: renderUtils.renderRsc,
      parseRsc: renderUtils.parseRsc,
      renderHtml: renderUtils.renderHtml,
      rscPath2pathname: (rscPath) =>
        joinPath(config.rscBase, encodeRscPath(rscPath)),
      saveBuildMetadata: async (key, value) => {
        buildMetadata.set(key, value);
      },
      withRequest: (req, fn) => INTERNAL_runWithContext(req, fn),
      generateFile: async (fileName, body) => {
        await emitFile(joinPath(DIST_PUBLIC, fileName), body);
      },
      generateDefaultHtml: async (fileName) => {
        await emitFile(
          joinPath(DIST_PUBLIC, fileName),
          await getFallbackHtml(),
        );
      },
    });

    await emitFile(
      joinPath(DIST_SERVER, BUILD_METADATA_FILE),
      `export const buildMetadata = new Map(${JSON.stringify(Array.from(buildMetadata))});`,
    );
  };

export const createServerEntryAdapter: CreateServerEntryAdapter =
  (fn) =>
  ({ handleRequest, handleBuild }, options) => {
    const processRequest = toProcessRequest(handleRequest);
    const processBuild = toProcessBuild(handleBuild);
    return fn(
      {
        processRequest,
        processBuild,
        config,
        isBuild,
        notFoundHtml,
      },
      options,
    );
  };
