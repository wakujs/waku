/// <reference types="vite/client" />

import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(
  import.meta.glob('./**/*.{tsx,ts}', { base: './pages' }),
);

export const getRouterConfigs = () => router.unstable_getRouterConfigs();

export default adapter(router);
