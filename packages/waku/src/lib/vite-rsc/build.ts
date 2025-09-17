import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc';
import type { ResolvedConfig as ViteConfig } from 'vite';
import { createRenderUtils } from '../utils/render.js';
import { encodeRscPath } from '../renderers/utils.js';
import { joinPath } from '../utils/path.js';
import type { Config } from '../../config.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function processBuild(
  viteConfig: Pick<ViteConfig, 'root'>,
  config: Pick<Required<Config>, 'distDir' | 'rscBase'>,
  emitStaticFile: (
    rootDir: string,
    config: Pick<Required<Config>, 'distDir'>,
    pathname: string,
    bodyPromise: Promise<ReadableStream | string>,
  ) => void,
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
      emitStaticFile(
        viteConfig.root,
        { distDir: config.distDir },
        pathname,
        body,
      );
    },
    generateDefaultHtml: async (pathname: string) => {
      emitStaticFile(
        viteConfig.root,
        { distDir: config.distDir },
        pathname,
        getFallbackHtml(),
      );
    },
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
