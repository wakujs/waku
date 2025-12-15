import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import type { ServerStyleSheet } from 'styled-components';
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const serverStyleSheetStorage = new AsyncLocalStorage<{
  sheet?: ServerStyleSheet;
}>();
(globalThis as any).__SERVER_STYLE_SHEET_STORAGE__ = serverStyleSheetStorage;
globalThis.require = createRequire(import.meta.url);

const patchRenderHtml =
  <Args extends unknown[]>(
    renderHtml: (...args: Args) => Promise<Response>,
  ): typeof renderHtml =>
  async (...args) => {
    const res = await renderHtml(...args);
    const sheet = serverStyleSheetStorage.getStore()?.sheet;
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

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default adapter({
  handleRequest: async (input, utils) =>
    serverStyleSheetStorage.run({}, () =>
      router.handleRequest(input, {
        ...utils,
        renderHtml: patchRenderHtml(utils.renderHtml),
      }),
    ),
  handleBuild: (utils) =>
    router.handleBuild({
      ...utils,
      renderHtml: patchRenderHtml(utils.renderHtml),
      withRequest: <T>(req: Request, fn: () => T): T =>
        serverStyleSheetStorage.run({}, () => utils.withRequest(req, fn)),
    }),
});
