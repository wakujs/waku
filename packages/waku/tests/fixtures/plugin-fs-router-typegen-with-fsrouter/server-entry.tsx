/// <reference types="vite/client" />
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';

export default adapter(
  fsRouter(import.meta.glob('./**/*.{tsx,ts}', { base: './pages' })),
);
