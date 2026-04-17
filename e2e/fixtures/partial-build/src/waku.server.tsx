import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
  {
    unstable_skipBuild: (routePath) => {
      const onlyBuild = process.env.ONLY_BUILD;
      if (!onlyBuild) {
        return false;
      }
      return !new RegExp(onlyBuild).test(routePath);
    },
  },
);

export default adapter(router);
