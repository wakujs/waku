import { AsyncLocalStorage } from 'node:async_hooks';

type Context = {
  readonly req: Request;
  readonly data: Record<string, unknown>;
};

const contextStorage = new AsyncLocalStorage<Context>();

export function INTERNAL_runWithContext<T>(req: Request, next: () => T): T {
  const context: Context = {
    req,
    data: {},
  };
  return contextStorage.run(context, next);
}

export function getContext() {
  const context = contextStorage.getStore();
  if (!context) {
    throw new Error(
      'Context is not available. Make sure to use the context middleware. For now, Context is not available during the build time.',
    );
  }
  return context;
}

export function getContextData(): Record<string, unknown> {
  const context = contextStorage.getStore();
  if (!context) {
    return {};
  }
  return context.data;
}
