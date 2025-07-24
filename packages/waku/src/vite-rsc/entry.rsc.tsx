import type {
  HandlerContext,
  MiddlewareOptions,
} from '../lib/middleware/types.js';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import type { MiddlewareHandler } from 'hono';
import { isBuild } from 'virtual:vite-rsc-waku/config';
import { type ReactNode } from 'react';

//
// main server handler as hono middleware
//

// cf. packages/waku/src/lib/hono/engine.ts
export function createHonoHandler(): MiddlewareHandler {
  let middlwareOptions: MiddlewareOptions;
  if (!isBuild) {
    middlwareOptions = {
      cmd: 'dev',
      env: {},
      unstable_onError: new Set(),
      get config(): any {
        throw new Error('unsupported');
      },
    };
  } else {
    middlwareOptions = {
      cmd: 'start',
      env: {},
      unstable_onError: new Set(),
      get loadEntries(): any {
        throw new Error('unsupported');
      },
    };
  }

  const handlers = middlewares.map((m) => m(middlwareOptions));

  return async (c, next) => {
    const ctx: HandlerContext = {
      req: {
        body: c.req.raw.body,
        url: new URL(c.req.url),
        method: c.req.method,
        headers: c.req.header(),
      },
      res: {},
      data: {
        __hono_context: c,
      },
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
    if (ctx.res.body || ctx.res.status) {
      const status = ctx.res.status || 200;
      const headers = ctx.res.headers || {};
      if (ctx.res.body) {
        return c.body(ctx.res.body, status as never, headers);
      }
      return c.body(null, status as never, headers);
    }
    await next();
  };
}

//
// Core RSC integration
//

export type RscElementsPayload = Record<string, unknown>;
export type RscHtmlPayload = ReactNode;

export { handleBuild } from './lib/rsc/build.js';
