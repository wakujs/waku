import { createRenderUtils } from './render.js';
import { encodeRscPath } from '../../lib/renderers/utils.js';
import { joinPath } from '../../lib/utils/path.js';
import { config } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

export async function handleBuild() {
  const renderUtils = createRenderUtils({});

  const buidlResult = serverEntry.handleBuild({
    renderRsc: renderUtils.renderRsc,
    renderHtml: renderUtils.renderHtml,
    rscPath2pathname: (rscPath) => {
      return joinPath(config.rscBase, encodeRscPath(rscPath));
    },
    // handled by Vite RSC
    unstable_collectClientModules: async () => {
      return [];
    },
    unstable_generatePrefetchCode: () => {
      return '';
    },
  });

  return buidlResult;
}
