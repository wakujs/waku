import { fsRouter } from 'waku';
import adapter from 'waku/adapters/default';
import { ConfiguredPage, GreetingPage } from './configured-pages';

const fileModules = import.meta.glob('./pages/**/*.{tsx,ts}');

// These module keys register routes without corresponding files in pages.
const configuredModules = {
  './pages/configured.tsx': async () => ({
    default: ConfiguredPage,
    getConfig: async () => ({ render: 'static' as const }),
  }),
  './pages/hello/[name].tsx': async () => ({
    default: GreetingPage,
    getConfig: async () => ({ render: 'dynamic' as const }),
  }),
};

// Object spread would otherwise silently replace a discovered module.
for (const key of Object.keys(configuredModules)) {
  if (key in fileModules) {
    throw new Error(`File/config route module collision: ${key}`);
  }
}

export default adapter(fsRouter({ ...fileModules, ...configuredModules }), {
  // A custom server entry replaces managed middleware discovery too.
  middlewareModules: import.meta.glob([
    './middleware/*.{tsx,ts}',
    '!./middleware/*.{test,spec}.{tsx,ts}',
  ]),
});
