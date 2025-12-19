import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import { unstable_loadSsrModule as loadSsrModule } from 'waku/server';

const { injectRenderHtml } =
  await loadSsrModule<typeof import('./server-html/ssr')>('./server-html/ssr');

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
);

export default adapter({
  handleRequest(input, utils) {
    return router.handleRequest(input, {
      ...utils,
      renderHtml: injectRenderHtml(utils.renderHtml),
    });
  },
  handleBuild(utils) {
    return router.handleBuild({
      ...utils,
      renderHtml: injectRenderHtml(utils.renderHtml),
    });
  },
});
