import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc';
import { config, isBuild, rootDir } from 'virtual:vite-rsc-waku/config';
import { DIST_PUBLIC } from '../constants.js';
import type {
  Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter,
  Unstable_HandleBuild as HandleBuild,
  Unstable_HandleRequest as HandleRequest,
  Unstable_ProcessBuild as ProcessBuild,
  Unstable_ProcessRequest as ProcessRequest,
} from '../types.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { extname, joinPath } from '../utils/path.js';
import { createRenderUtils } from '../utils/render.js';
import { getInput } from '../utils/request.js';
import { encodeRscPath } from '../utils/rsc-path.js';
import { stringToStream } from '../utils/stream.js';
import { createTaskRunner, emitFileInTask } from '../utils/task-runner.js';

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
    await import('virtual:vite-rsc-waku/set-platform-data');

    const temporaryReferences = createTemporaryReferenceSet();

    const input = await getInput(
      req,
      config,
      temporaryReferences,
      decodeReply,
      decodeAction,
      decodeFormState,
      loadServerAction,
    );

    const renderUtils = createRenderUtils(
      temporaryReferences,
      renderToReadableStream,
      loadSsrEntryModule,
    );

    let res: Awaited<ReturnType<typeof handleRequest>>;
    try {
      res = await handleRequest(input, renderUtils);
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
  async () => {
    const renderUtils = createRenderUtils(
      undefined,
      renderToReadableStream,
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

    const { runTask, waitForTasks } = createTaskRunner();

    await handleBuild({
      renderRsc: renderUtils.renderRsc,
      renderHtml: renderUtils.renderHtml,
      rscPath2pathname: (rscPath) =>
        joinPath(config.rscBase, encodeRscPath(rscPath)),
      generateFile: async (
        pathname: string,
        body: Promise<ReadableStream | string>,
      ) => {
        const filePath = joinPath(
          config.distDir,
          DIST_PUBLIC,
          extname(pathname)
            ? pathname
            : pathname === '/404'
              ? '404.html' // HACK special treatment for 404, better way?
              : pathname + '/index.html',
        );
        await emitFileInTask(runTask, rootDir, filePath, body);
      },
      generateDefaultHtml: async (pathname: string) => {
        const filePath = joinPath(
          config.distDir,
          DIST_PUBLIC,
          extname(pathname)
            ? pathname
            : pathname === '/404'
              ? '404.html' // HACK special treatment for 404, better way?
              : pathname + '/index.html',
        );
        await emitFileInTask(runTask, rootDir, filePath, getFallbackHtml());
      },
    });

    await waitForTasks();
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
      },
      options,
    );
  };

export const getConfigAdapter = () => config.adapter;
