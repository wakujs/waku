import type { MiddlewareHandler } from 'hono';
import { INTERNAL_runWithContext } from '../context.js';
import type { Unstable_ProcessRequest as ProcessRequest } from '../types.js';

export function contextMiddleware(): MiddlewareHandler {
  return (c, next) => {
    const req = c.req.raw;
    return INTERNAL_runWithContext(req, next);
  };
}

export function rscMiddleware({
  processRequest,
}: {
  processRequest: ProcessRequest;
}): MiddlewareHandler {
  return async (c, next) => {
    const req = c.req.raw;
    const res = await processRequest(req);
    if (res) {
      c.res = res;
      return;
    }
    await next();
  };
}

export function middlewareRunner(
  middlewareModules: Record<
    string,
    () => Promise<{
      default: () => MiddlewareHandler;
    }>
  >,
): MiddlewareHandler {
  let handlersPromise: Promise<MiddlewareHandler[]> | undefined;
  return async (c, next) => {
    if (!handlersPromise) {
      handlersPromise = Promise.all(
        Object.values(middlewareModules).map((m) =>
          m().then((mod) => mod.default()),
        ),
      );
    }
    const handlers = await handlersPromise;
    const run = async (index: number) => {
      const handler = handlers[index];
      if (handler) {
        await handler(c, () => run(index + 1));
      } else {
        await next();
      }
    };
    await run(0);
  };
}
