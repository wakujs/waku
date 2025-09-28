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
  let handlers: MiddlewareHandler[] | undefined;
  return async (c, next) => {
    if (!handlers) {
      handlers = await Promise.all(
        Object.values(middlewareModules).map((m) =>
          m().then((mod) => mod.default()),
        ),
      );
    }
    const run = async (index: number) => {
      await handlers![index]?.(c, () => run(index + 1));
    };
    await run(0);
    await next();
  };
}
