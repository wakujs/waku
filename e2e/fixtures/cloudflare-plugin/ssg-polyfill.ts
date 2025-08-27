import { Plugin } from 'vite';
import { LoadHook, register, ResolveHook } from 'node:module';
import { getPlatformProxy } from 'wrangler';

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

// use node custom loader to implement "cloudflare:workers"
async function registerPolyfill() {
  const platformProxy = await getPlatformProxy();
  (globalThis as any).__polyfill_platform_proxy = platformProxy;

  const resolveFn: ResolveHook = async function (
    specifier,
    context,
    nextResolve,
  ) {
    if (specifier === 'cloudflare:workers') {
      return {
        shortCircuit: true,
        url: specifier,
      };
    }
    return nextResolve(specifier, context);
  };

  const loadFn: LoadHook = async function (url, context, nextLoad) {
    if (url === 'cloudflare:workers') {
      return {
        shortCircuit: true,
        format: 'module',
        source: `export const env = globalThis.__polyfill_platform_proxy.env`,
      };
    }
    return nextLoad(url, context);
  };

  register(`data:text/javascript,
export const resolve = ${resolveFn.toString()};
export const load = ${loadFn.toString()};    
`);

  return async () => {
    await platformProxy.dispose();
  };
}
