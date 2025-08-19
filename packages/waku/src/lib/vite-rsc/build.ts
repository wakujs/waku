import { renderToReadableStream } from '@vitejs/plugin-rsc/rsc';
import { createRenderUtils } from '../utils/render.js';
import { encodeRscPath } from '../renderers/utils.js';
import { joinPath } from '../utils/path.js';
import { config } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function handleBuild() {
  const renderUtils = createRenderUtils(
    undefined,
    renderToReadableStream,
    loadSsrEntryModule,
  );

  const buidlResult = serverEntry.handleBuild({
    renderRsc: renderUtils.renderRsc,
    renderHtml: renderUtils.renderHtml,
    rscPath2pathname: (rscPath) =>
      joinPath(config.rscBase, encodeRscPath(rscPath)),
  });

  return buidlResult;
}

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<typeof import('./ssr.js')>(
    'ssr',
    'index',
  );
}
