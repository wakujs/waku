import type { Hono } from 'hono';
import type { BlankEnv, BlankSchema } from 'hono/types';
import { INTERNAL_setAllEnv } from 'waku/server';

export const cloudflareDevServer = (cfOptions: any) => {
  const wranglerPromise = import('wrangler')
    .then(({ getPlatformProxy }) => getPlatformProxy({ ...(cfOptions || {}) }))
    .then((proxy) => {
      INTERNAL_setAllEnv(proxy.env as any);
      return proxy;
    });
  const miniflarePromise = import('miniflare').then(({ WebSocketPair }) => {
    Object.assign(globalThis, { WebSocketPair });
  });
  return async (req: Request, app: Hono<BlankEnv, BlankSchema>) => {
    const [proxy, _] = await Promise.all([wranglerPromise, miniflarePromise]);
    Object.assign(req, { cf: proxy.cf });
    Object.assign(globalThis, {
      caches: proxy.caches,
    });
    return app.fetch(req, proxy.env, proxy.ctx);
  };
};
