import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  decodeAction,
  decodeFormState,
} from '@vitejs/plugin-rsc/rsc';
import { decodeFuncId, decodeRscPath } from '../../lib/renderers/utils.js';
import { stringToStream } from '../../lib/utils/stream.js';
import { getErrorInfo } from '../../lib/utils/custom-errors.js';
import type { HandlerContext } from '../../lib/middleware/types.js';
import { config } from 'virtual:vite-rsc-waku/config';
import { createRenderUtils, loadSsrEntryModule } from './render.js';
import type { HandleRequest } from '../../lib/types.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';

type HandleRequestInput = Parameters<HandleRequest>[0];
type HandleRequestOutput = Awaited<ReturnType<HandleRequest>>;

// cf. `handler` in packages/waku/src/lib/middleware/handler.ts
export async function handleRequest(ctx: HandlerContext) {
  await import('virtual:vite-rsc-waku/set-platform-data');

  const { input, temporaryReferences } = await getInput(ctx);

  const renderUtils = createRenderUtils({
    temporaryReferences,
  });

  let res: HandleRequestOutput;
  try {
    res = await serverEntry.handleRequest(input, renderUtils);
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
  } else if (res && res !== 'fallback') {
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
  if (
    res === 'fallback' ||
    (!(ctx.res.body || ctx.res.status) && ctx.req.url.pathname === '/')
  ) {
    const { renderHtmlFallback } = await loadSsrEntryModule();
    const htmlFallbackStream = await renderHtmlFallback();
    ctx.res.body = htmlFallbackStream;
    ctx.res.headers = { 'content-type': 'text/html;charset=utf-8' };
  }
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
      temporaryReferences = createTemporaryReferenceSet();
      const args = await decodeReply(body, { temporaryReferences });
      const action = await loadServerAction(actionId);
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
        rscParams = await decodeReply(body, {
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
      const decodedAction = await decodeAction(formData);
      input = {
        type: 'action',
        fn: async () => {
          const result = await decodedAction();
          return await decodeFormState(result, formData);
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
