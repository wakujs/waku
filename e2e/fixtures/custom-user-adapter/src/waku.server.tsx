import { fsRouter } from 'waku';
import adapter from './custom-adapter.js';

const router = fsRouter(import.meta.glob('./pages/**/*.tsx'));

export default adapter(router);
