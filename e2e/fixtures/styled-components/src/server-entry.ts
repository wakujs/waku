import { AsyncLocalStorage } from 'node:async_hooks';
import { Readable } from 'node:stream';
import type { ServerStyleSheet } from 'styled-components';
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const sheetStorage = ((globalThis as any).__WAKU_STYLED_COMPONENTS_ALS__ ??=
  new AsyncLocalStorage<{
    sheet?: ServerStyleSheet;
  }>());

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default adapter({
  handleRequest: async (input, utils) => {
    const store: { sheet?: ServerStyleSheet } = {};
    return sheetStorage.run(store, async () => {
      const renderHtml: typeof utils.renderHtml = async (
        elementsStream,
        html,
        options,
      ) => {
        const res = await utils.renderHtml(elementsStream, html, options);
        const sheet = store.sheet;
        if (!sheet) {
          throw new Error('ServerStyleSheet is not available');
        }
        const nodeReadable = Readable.fromWeb(res.body as never);
        const newNodeReadable = sheet.interleaveWithNodeStream(nodeReadable);
        const newBody = Readable.toWeb(newNodeReadable);
        const newRes = new Response(newBody as never, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        });
        return newRes;
      };
      return router.handleRequest(input, { ...utils, renderHtml });
    });
  },
  handleBuild: (utils) => {
    return router.handleBuild(utils);
  },
});
