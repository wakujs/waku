import type { MiddlewareHandler } from 'hono';

import { resolveConfig } from '../config.js';
import type { HandlerContext, MiddlewareOptions } from '../middleware/types.js';

const createEmptyReadableStream = () =>
  new ReadableStream({
    start(controller) {
      controller.close();
    },
  });

export const runner = (options: MiddlewareOptions): MiddlewareHandler => {
  const entriesPromise =
    options.cmd === 'start'
      ? options.loadEntries()
      : ('Error: loadEntries are not available' as never);
  const configPromise =
    options.cmd === 'start'
      ? entriesPromise.then((entries) =>
          entries.loadConfig().then((config) => resolveConfig(config)),
        )
      : resolveConfig(options.config);
  const handlersPromise = configPromise.then((config) =>
    Promise.all(
      config
        .middleware()
        .map(async (middleware) => (await middleware).default(options)),
    ),
  );
  return async (c, next) => {
    const ctx: HandlerContext = {
      req: {
        body: c.req.raw.body || createEmptyReadableStream(),
        url: new URL(c.req.url),
        method: c.req.method,
        headers: c.req.header(),
      },
      res: {},
      context: {},
    };
    const handlers = await handlersPromise;
    const run = async (index: number) => {
      if (index >= handlers.length) {
        return next();
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
    /* checking ctx.res.body is a workaround for dev server 404 response */
    if (!c.finalized/* || ctx.res.body*/) {
      return c.body(
        ctx.res.body || null,
        (ctx.res.status as any) || 200,
        ctx.res.headers || {},
      );
    }
  };
};
