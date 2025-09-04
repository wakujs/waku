import { createPages } from 'waku/router/server';

import { ServerEcho } from './ServerEcho.js';
import { ClientEcho } from './ClientEcho.js';
import BuildStatic from './build/static.js';
import BuildDynamic from './build/dynamic.js';
import Root from './root.js';

// This needs type annotations for the return type of createPages
// @see https://github.com/microsoft/TypeScript/issues/42873#issuecomment-2065572017
const router: ReturnType<typeof createPages> = createPages(
  async ({ createPage }) => [
    createPage({
      render: 'static',
      path: '/',
      component: Root,
    }),
    createPage({
      render: 'dynamic',
      path: '/server/dynamic/[echo]',
      component: ServerEcho,
    }),
    createPage({
      render: 'static',
      path: '/server/static/[echo]',
      staticPaths: ['static-echo'],
      component: ServerEcho,
    }),
    createPage({
      render: 'dynamic',
      path: '/client/dynamic/[echo]',
      component: ClientEcho,
    }),
    createPage({
      render: 'static',
      path: '/client/static/[echo]',
      staticPaths: ['static-echo'],
      component: ClientEcho,
    }),
    createPage({
      render: 'static',
      path: '/build/static',
      component: BuildStatic,
    }),
    createPage({
      render: 'dynamic',
      path: '/build/dynamic',
      component: BuildDynamic,
    }),
  ],
);

export default router;
