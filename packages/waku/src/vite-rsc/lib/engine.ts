import type {
  HandlerContext,
  MiddlewareOptions,
} from '../../lib/middleware/types.js';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import type { MiddlewareHandler, Hono } from 'hono';
import { flags, config, isBuild } from 'virtual:vite-rsc-waku/config';
import { compress } from 'hono/compress';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'node:path';
import fs from 'node:fs';
import { DIST_PUBLIC } from '../../lib/builder/constants.js';
import { INTERNAL_setAllEnv } from '../../server.js';

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

// cf. packages/waku/src/vite-rsc/entry.server.tsx
export function createApp(app: Hono) {
  INTERNAL_setAllEnv(process.env as any);
  if (flags['experimental-compress']) {
    app.use(compress());
  }
  if (isBuild) {
    app.use(serveStatic({ root: path.join(config.distDir, DIST_PUBLIC) }));
  }
  app.use(createHonoHandler());
  app.notFound((c) => {
    const file = path.join(config.distDir, DIST_PUBLIC, '404.html');
    if (fs.existsSync(file)) {
      return c.html(fs.readFileSync(file, 'utf8'), 404);
    }
    return c.text('404 Not Found', 404);
  });
  return app;
}
