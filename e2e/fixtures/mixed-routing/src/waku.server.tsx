import { createPages } from 'waku';
import adapter from 'waku/adapters/default';
import { ConfiguredPage, GreetingPage } from './configured-pages';

const pages = createPages(async ({ createPage, unstable_createFileRoutes }) => {
  await unstable_createFileRoutes(import.meta.glob('./pages/**/*.{tsx,ts}'));

  return [
    createPage({
      path: '/configured',
      render: 'static',
      component: ConfiguredPage,
    }),
    createPage({
      path: '/hello/[name]',
      render: 'dynamic',
      component: GreetingPage,
    }),
  ];
});

export default adapter(pages, {
  // A custom server entry replaces managed middleware discovery too.
  middlewareModules: import.meta.glob([
    './middleware/*.{tsx,ts}',
    '!./middleware/*.{test,spec}.{tsx,ts}',
  ]),
});
