import { nodeAdapter } from 'waku/adapters/node';
import { createPages } from 'waku/router/server';
import { HomePage } from './templates/home-page';
import { RootLayout } from './templates/root-layout';

export default nodeAdapter(
  createPages(async ({ createPage, createLayout }) => [
    createLayout({
      render: 'static',
      path: '/',
      component: RootLayout,
    }),

    createPage({
      render: 'static',
      path: '/',
      component: HomePage,
    }),
  ]),
);
