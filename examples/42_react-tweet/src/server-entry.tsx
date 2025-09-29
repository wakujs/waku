import { createPages } from 'waku/router/server';
import { nodeAdapter } from 'waku/adapters/node';

import { RootLayout } from './templates/root-layout';
import { HomePage } from './templates/home-page';

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
