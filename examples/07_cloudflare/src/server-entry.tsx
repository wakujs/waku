/// <reference types="vite/client" />
import { contextStorage, getContext } from 'hono/context-storage';
import { fsRouter } from 'waku';
import adapter from 'waku/adapters/cloudflare';
import cloudflareMiddleware from './middleware/cloudflare';

const patchFetch = (fetch: (req: Request) => Response | Promise<Response>) => {
  if (import.meta.env && !import.meta.env.PROD) {
    const handlerPromise = import('./waku.cloudflare-dev-server').then(
      ({ cloudflareDevServer }) =>
        cloudflareDevServer({
          // Optional config settings for the Cloudflare dev server (wrangler proxy)
          // https://developers.cloudflare.com/workers/wrangler/api/#parameters-1
          persist: {
            path: '.wrangler/state/v3',
          },
        }),
    );
    return async (req: Request) => {
      const devHandler = await handlerPromise;
      return devHandler(req, fetch);
    };
  }
  return fetch;
};

const serverEntry = adapter(
  fsRouter(import.meta.glob('./**/*.tsx', { base: './pages' })),
  { middlewareFns: [contextStorage, cloudflareMiddleware] },
);

export default {
  ...serverEntry,
  fetch: patchFetch(serverEntry.fetch),
};

export const getHonoContext = ((globalThis as any).__WAKU_GET_HONO_CONTEXT__ ||=
  getContext);
