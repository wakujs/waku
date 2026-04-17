import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
  {
    unstable_buildFilter: (routePath) => {
      return new RegExp(process.env.ONLY_BUILD || '').test(routePath);
    },
  },
);

export default adapter(router);
