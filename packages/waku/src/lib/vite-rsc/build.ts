import { createRenderUtils } from './render.js';
import { encodeRscPath } from '../renderers/utils.js';
import { joinPath } from '../utils/path.js';
import { config } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function handleBuild() {
  const renderUtils = createRenderUtils({});

  const buidlResult = serverEntry.handleBuild({
    renderRsc: renderUtils.renderRsc,
    renderHtml: renderUtils.renderHtml,
    rscPath2pathname: (rscPath) =>
      joinPath(config.rscBase, encodeRscPath(rscPath)),
  });

  return buidlResult;
}
