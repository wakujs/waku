import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
);

async function getEnhancer() {
  const mod: typeof import("./server-html/ssr") =
        await import.meta.viteRsc.loadModule("ssr", "__server_html")
  return mod.injectRenderHtml;
}

export default adapter({
  async handleRequest(input, utils) {
    return router.handleRequest(input, {
      ...utils,
      renderHtml: (await getEnhancer())(utils.renderHtml),
    });
  },
  async handleBuild(utils) {
    return router.handleBuild({
      ...utils,
      renderHtml: (await getEnhancer())(utils.renderHtml),
    });
  },
});
