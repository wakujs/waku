import { Readable } from 'node:stream';
import { ServerStyleSheet } from 'styled-components';
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default adapter({
  handleRequest: async (input, utils) => {
    const sheet = new ServerStyleSheet();
    const renderHtml: typeof utils.renderHtml = async (
      elementsStream,
      html,
      options,
    ) => {
      const wrappedHtml = sheet.collectStyles(html);
      const res = await utils.renderHtml(elementsStream, wrappedHtml, options);
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
  },
  handleBuild: (utils) => {
    return router.handleBuild(utils);
  },
});
