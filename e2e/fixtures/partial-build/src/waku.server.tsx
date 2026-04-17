import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
  {
    unstable_buildFilter: (routePath) => {
      return process.env.SKIP_BUILD !== routePath;
    },
  },
);

export default adapter(router);
