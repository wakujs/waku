import { createPages } from 'waku';
import adapter from 'waku/adapters/default';
import HomePage from './pages/index.js';

const pages = createPages(async ({ createPage }) => [
  createPage({
    render: 'static',
    path: '/',
    component: HomePage,
  }),
]);

export default adapter(pages);
