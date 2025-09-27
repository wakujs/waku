import type { MiddlewareHandler } from 'hono';

export const middlewareRunner = (
  middlewareModules: Record<
    string,
    () => Promise<{
      default: () => MiddlewareHandler;
    }>
  >,
): MiddlewareHandler => {
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
};
