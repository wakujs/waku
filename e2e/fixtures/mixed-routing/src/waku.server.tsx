import { createPages } from 'waku';
import adapter from 'waku/adapters/default';
import { unstable_createFileRoutes } from 'waku/router/server';
import { ConfiguredPage, GreetingPage } from './configured-pages';

const pages = createPages(async (fns) => {
  const { createPage } = fns;
  await unstable_createFileRoutes(
    fns,
    import.meta.glob('./pages/**/*.{tsx,ts}'),
  );

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
