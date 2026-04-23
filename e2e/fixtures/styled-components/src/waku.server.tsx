import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import { injectRenderHtml } from './server-html/ssr';

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
