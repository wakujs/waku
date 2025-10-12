import type { MiddlewareHandler } from 'hono';
import { isBuild } from 'virtual:vite-rsc-waku/config';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import { contextMiddleware } from '../context.js';
import type { HandlerContext, MiddlewareOptions } from '../types.js';
import { handlerMiddleware } from './handler.js';

// cf. packages/waku/src/lib/hono/engine.ts
export function createHonoHandler(): MiddlewareHandler {
  let middlwareOptions: MiddlewareOptions;
  if (!isBuild) {
    middlwareOptions = {
      cmd: 'dev',
      env: {},
    };
  } else {
    middlwareOptions = {
      cmd: 'start',
      env: {},
    };
  }

  const handlers = [contextMiddleware, ...middlewares, handlerMiddleware].map(
    (m) => m(middlwareOptions),
  );

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
