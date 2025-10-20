import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import type { ResolvedConfig as ViteConfig } from 'vite';
import type { Config } from '../../config.js';
import { DIST_PUBLIC } from '../constants.js';
import { extname, joinPath } from '../utils/path.js';
import { createRenderUtils } from '../utils/render.js';
import { encodeRscPath } from '../utils/rsc-path.js';

export async function processBuild(
  viteConfig: Pick<ViteConfig, 'root'>,
  config: Pick<Required<Config>, 'distDir' | 'rscBase'>,
  emitFileInTask: (
    rootDir: string,
    filePath: string,
    bodyPromise: Promise<ReadableStream | string>,
  ) => void,
  emitBuildMetadata: (key: string, value: any) => void,
) {
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

  await serverEntry.handleBuild({
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
      emitFileInTask(viteConfig.root, filePath, body);
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
      emitFileInTask(viteConfig.root, filePath, getFallbackHtml());
    },
    emitBuildMetadata,
  });
}

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<typeof import('./ssr.js')>(
    'ssr',
    'index',
  );
}
