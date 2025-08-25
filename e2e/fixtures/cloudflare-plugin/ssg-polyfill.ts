import { Plugin } from 'vite';
import { registerHooks } from 'node:module';
import { getPlatformProxy } from 'wrangler';

// polyfill "cloudflare:workers" for ssg running on Node

export function ssgPolyfillPlugin(): Plugin[] {
  let deregister: () => Promise<void>;
  return [
    {
      name: 'ssg-polyfill',
      apply: 'build',
      enforce: 'pre',
      async buildApp() {
        deregister = await registerPolyfill();
      },
    },
    {
      name: 'ssg-polyfill-post',
      apply: 'build',
      enforce: 'post',
      async buildApp() {
        await deregister();
      },
    },
  ];
}

async function registerPolyfill() {
  const platformProxy = await getPlatformProxy();
  (globalThis as any).__polyfill_platform_proxy = platformProxy;

  const hooks = registerHooks({
    resolve: (specifier, context, nextResolve) => {
      if (specifier === 'cloudflare:workers') {
        return {
          shortCircuit: true,
          url: specifier,
        };
      }
      return nextResolve(specifier, context);
    },
    load: (url, context, nextLoad) => {
      if (url === 'cloudflare:workers') {
        return {
          shortCircuit: true,
          format: 'module',
          source: `export const env = globalThis.__polyfill_platform_proxy.env`,
        };
      }
      return nextLoad(url, context);
    },
  });

  return async () => {
    await platformProxy.dispose();
    hooks.deregister();
  };
}
