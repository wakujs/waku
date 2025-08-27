import { AsyncLocalStorage } from 'node:async_hooks';
import type { Middleware } from './types.js';

type Context = {
  readonly req: Request;
  readonly data: Record<string, unknown>;
};

const contextStorage = new AsyncLocalStorage<Context>();

export const context: Middleware = () => {
  return async (ctx, next) => {
    const context: Context = {
      req: ctx.req,
      data: ctx.data,
    };
    return contextStorage.run(context, next);
  };
};

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
