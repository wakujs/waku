import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
);

export default adapter({
  handleRequest: async (input, utils) => {
    const res = await router.handleRequest(input, utils);
    if (res) {
      return res;
    }
    if (input.type === 'custom') {
      return router.handleRequest({ ...input, pathname: '/' }, utils);
    }
  },
  handleBuild: (utils) => router.handleBuild(utils),
});
