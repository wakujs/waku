import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import { unstable_loadSsrModule as loadSsrModule } from 'waku/server';

const { cssInJs } =
  await loadSsrModule<typeof import('./server-html/ssr')>('./server-html/ssr');

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
);

export default adapter(cssInJs(router));
