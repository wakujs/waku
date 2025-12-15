import { fsRouter } from 'waku';
import adapter from './custom-adapter.js';

const router = fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' }));

export default adapter(router);
