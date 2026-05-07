import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

export default adapter(fsRouter(import.meta.glob('./pages/**/*.{tsx,ts}')));
