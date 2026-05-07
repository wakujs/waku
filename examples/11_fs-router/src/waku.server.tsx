import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

const router = fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}'));

export const getRouterConfigs = () => router.unstable_getRouterConfigs();

export default adapter(router);
