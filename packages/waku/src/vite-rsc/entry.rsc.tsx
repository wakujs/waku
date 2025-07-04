import * as ReactServer from '@vitejs/plugin-rsc/rsc';
import type { unstable_defineEntries } from '../minimal/server.js';
import {
  decodeFuncId,
  decodeRscPath,
  encodeRscPath,
} from '../lib/renderers/utils.js';
import { stringToStream } from '../lib/utils/stream.js';
import { INTERNAL_setAllEnv } from '../server.js';
import { joinPath } from '../lib/utils/path.js';
import { context } from '../lib/middleware/context.js';
import { getErrorInfo } from '../lib/utils/custom-errors.js';
import type {
  HandlerContext,
  Middleware,
  MiddlewareOptions,
} from '../lib/middleware/types.js';
import { middlewares } from 'virtual:vite-rsc-waku/middlewares';
import type { MiddlewareHandler } from 'hono';
import { config, isBuild } from 'virtual:vite-rsc-waku/config';
import type { ReactNode } from 'react';

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

  // assume builtin handlers are always enabled
  const allMiddlewares: Middleware[] = [
    context,
    ...middlewares,
    () => handleRequest,
  ];
  const handlers = allMiddlewares.map((m) => m(middlwareOptions));

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

type WakuServerEntry = ReturnType<typeof unstable_defineEntries>;
type HandleRequestInput = Parameters<WakuServerEntry['handleRequest']>[0];
type HandleRequestOutput = Awaited<
  ReturnType<WakuServerEntry['handleRequest']>
>;
type RenderUtils = Parameters<WakuServerEntry['handleRequest']>[1];

// core RSC/HTML rendering implementation
function createRenderUtils({
  temporaryReferences,
}: {
  temporaryReferences?: unknown;
}): RenderUtils {
  const onError = (e: unknown) => {
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof e.digest === 'string'
    ) {
      return e.digest;
    }
  };

  return {
    async renderRsc(elements) {
      return ReactServer.renderToReadableStream<RscElementsPayload>(elements, {
        temporaryReferences,
        onError,
      });
    },
    async renderHtml(
      elements,
      html,
      options?: { rscPath?: string; actionResult?: any },
    ) {
      const ssrEntryModule = await import.meta.viteRsc.loadModule<
        typeof import('./entry.ssr.tsx')
      >('ssr', 'index');

      const rscElementsStream =
        ReactServer.renderToReadableStream<RscElementsPayload>(elements, {
          onError,
        });

      const rscHtmlStream = ReactServer.renderToReadableStream<RscHtmlPayload>(
        html,
        { onError },
      );

      const htmlStream = await ssrEntryModule.renderHTML(
        rscElementsStream,
        rscHtmlStream,
        {
          formState: options?.actionResult,
          rscPath: options?.rscPath,
        },
      );
      return {
        body: htmlStream as any,
        headers: { 'content-type': 'text/html' },
      };
    },
  };
}

// cf. `getInput` in packages/waku/src/lib/middleware/handler.ts
async function getInput(ctx: HandlerContext) {
  const url = ctx.req.url;
  const rscPathPrefix = config.basePath + config.rscBase + '/';
  let rscPath: string | undefined;
  let temporaryReferences: unknown | undefined;
  let input: HandleRequestInput;
  const request = (ctx.data.__hono_context as any).req.raw as Request;
  if (url.pathname.startsWith(rscPathPrefix)) {
    rscPath = decodeRscPath(
      decodeURI(url.pathname.slice(rscPathPrefix.length)),
    );
    // server action: js
    const actionId = decodeFuncId(rscPath);
    if (actionId) {
      const contentType = ctx.req.headers['content-type'];
      const body = contentType?.startsWith('multipart/form-data')
        ? await request.formData()
        : await request.text();
      temporaryReferences = ReactServer.createTemporaryReferenceSet();
      const args = await ReactServer.decodeReply(body, { temporaryReferences });
      const action = await ReactServer.loadServerAction(actionId);
      input = {
        type: 'function',
        fn: action as any,
        args,
        req: ctx.req,
      };
    } else {
      // client RSC request
      let rscParams: unknown = url.searchParams;
      if (ctx.req.body) {
        const contentType = ctx.req.headers['content-type'];
        const body = contentType?.startsWith('multipart/form-data')
          ? await request.formData()
          : await request.text();
        rscParams = await ReactServer.decodeReply(body, {
          temporaryReferences,
        });
      }
      input = {
        type: 'component',
        rscPath,
        rscParams,
        req: ctx.req,
      };
    }
  } else if (ctx.req.method === 'POST') {
    // cf. packages/waku/src/lib/renderers/rsc.ts `decodePostAction`
    const contentType = ctx.req.headers['content-type'];
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // server action: no js (progressive enhancement)
      const formData = await request.formData();
      const decodedAction = await ReactServer.decodeAction(formData);
      input = {
        type: 'action',
        fn: async () => {
          const result = await decodedAction();
          return await ReactServer.decodeFormState(result, formData);
        },
        pathname: decodeURI(url.pathname),
        req: ctx.req,
      };
    } else {
      // POST API request
      input = {
        type: 'custom',
        pathname: decodeURI(url.pathname),
        req: ctx.req,
      };
    }
  } else {
    // SSR
    input = {
      type: 'custom',
      pathname: decodeURI(url.pathname),
      req: ctx.req,
    };
  }
  return { input, temporaryReferences };
}

// cf. `handler` in packages/waku/src/lib/middleware/handler.ts
async function handleRequest(ctx: HandlerContext) {
  INTERNAL_setAllEnv(process.env as any);

  await import('virtual:vite-rsc-waku/set-platform-data');

  const { input, temporaryReferences } = await getInput(ctx);

  const wakuServerEntry = (await import('virtual:vite-rsc-waku/server-entry'))
    .default;

  const renderUtils = createRenderUtils({
    temporaryReferences,
  });

  let res: HandleRequestOutput;
  try {
    res = await wakuServerEntry.handleRequest(input, renderUtils);
  } catch (e) {
    const info = getErrorInfo(e);
    ctx.res.status = info?.status || 500;
    ctx.res.body = stringToStream(
      (e as { message?: string } | undefined)?.message || String(e),
    );
    if (info?.location) {
      (ctx.res.headers ||= {}).location = info.location;
    }
  }

  if (res instanceof ReadableStream) {
    ctx.res.body = res;
  } else if (res) {
    if (res.body) {
      ctx.res.body = res.body;
    }
    if (res.status) {
      ctx.res.status = res.status;
    }
    if (res.headers) {
      Object.assign((ctx.res.headers ||= {}), res.headers);
    }
  }

  // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
  if (!(ctx.res.body || ctx.res.status) && ctx.req.url.pathname === '/') {
    const ssrEntryModule = await import.meta.viteRsc.loadModule<
      typeof import('./entry.ssr.tsx')
    >('ssr', 'index');
    const htmlFallbackStream = await ssrEntryModule.renderHtmlFallback();
    ctx.res.body = htmlFallbackStream;
    ctx.res.headers = { 'content-type': 'text/html;charset=utf-8' };
  }
}

export async function handleBuild() {
  INTERNAL_setAllEnv(process.env as any);

  const wakuServerEntry = (await import('virtual:vite-rsc-waku/server-entry'))
    .default;

  const renderUtils = createRenderUtils({});

  const buidlResult = wakuServerEntry.handleBuild({
    renderRsc: renderUtils.renderRsc,
    renderHtml: renderUtils.renderHtml,
    rscPath2pathname: (rscPath) => {
      return joinPath(config.rscBase, encodeRscPath(rscPath));
    },
    // handled by Vite RSC
    unstable_collectClientModules: async () => {
      return [];
    },
    unstable_generatePrefetchCode: () => {
      return '';
    },
  });

  return buidlResult;
}
