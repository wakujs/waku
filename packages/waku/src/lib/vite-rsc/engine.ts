import type { HandlerContext, MiddlewareOptions } from '../types.js';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import type { MiddlewareHandler } from 'hono';
import { isBuild } from 'virtual:vite-rsc-waku/config';

// cf. packages/waku/src/lib/hono/engine.ts
export function createHonoHandler(): MiddlewareHandler {
  let middlwareOptions: MiddlewareOptions;
  if (!isBuild) {
    middlwareOptions = {
      cmd: 'dev',
      env: {},
      unstable_onError: new Set(),
    };
  } else {
    middlwareOptions = {
      cmd: 'start',
      env: {},
      unstable_onError: new Set(),
    };
  }

  const handlers = middlewares.map((m) => m(middlwareOptions));

  return async (c, next) => {
    const ctx: HandlerContext = {
      req: c.req.raw,
      data: {},
    };
    const run = async (index: number) => {
      if (index >= handlers.length) {
        return;
      }
      let alreadyCalled = false;
      await handlers[index]!(ctx, async () => {
        if (!alreadyCalled) {
          alreadyCalled = true;
          await run(index + 1);
        }
      });
    };
    await run(0);
    if (ctx.res) {
      c.res = ctx.res;
      return;
    }
    await next();
  };
}
