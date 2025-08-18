import type {
  HandlerContext,
  MiddlewareOptions,
} from '../../lib/middleware/types.js';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import { isBuild } from 'virtual:vite-rsc-waku/config';

export function createEngine(): ({
  req,
  data,
}: {
  req: Request;
  data?: Record<string, unknown>;
}) => Promise<HandlerContext> {
  let middlewareOptions: MiddlewareOptions;
  if (!isBuild) {
    middlewareOptions = {
      cmd: 'dev',
      env: {},
      unstable_onError: new Set(),
      get config(): any {
        throw new Error('unsupported');
      },
    };
  } else {
    middlewareOptions = {
      cmd: 'start',
      env: {},
      unstable_onError: new Set(),
      get loadEntries(): any {
        throw new Error('unsupported');
      },
    };
  }

  const handlers = middlewares.map((m) => m(middlewareOptions));

  return async ({
    req,
    data,
  }: {
    req: Request;
    data?: Record<string, unknown>;
  }): Promise<HandlerContext> => {
    const ctx: HandlerContext = {
      req: {
        body: req.body,
        url: new URL(req.url),
        method: req.method,
        headers: Object.fromEntries(req.headers as any) as Record<
          string,
          string
        >,
      },
      res: {},
      data: data || {},
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
    return ctx;
  };
}
