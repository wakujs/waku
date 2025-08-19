import {
  createTemporaryReferenceSet,
  decodeReply,
  loadServerAction,
  decodeAction,
  decodeFormState,
} from '@vitejs/plugin-rsc/rsc';
import { decodeFuncId, decodeRscPath } from '../renderers/utils.js';
import { streamToArrayBuffer, stringToStream } from '../utils/stream.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import type { HandlerContext } from '../middleware/types.js';
import { config } from 'virtual:vite-rsc-waku/config';
import { createRenderUtils, loadSsrEntryModule } from './render.js';
import type { HandleRequest } from '../types.js';
import { bufferToString, parseFormData } from '../utils/buffer.js';
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
    const status = info?.status || 500;
    const body = stringToStream(
      (e as { message?: string } | undefined)?.message || String(e),
    );
    const headers: { location?: string } = {};
    if (info?.location) {
      headers.location = info.location;
    }
    ctx.res = new Response(body, { status, headers });
  }

  if (res instanceof ReadableStream) {
    ctx.res = new Response(res);
  } else if (res && res !== 'fallback') {
    ctx.res = res;
  }

  // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
  const url = new URL(ctx.req.url);
  if (res === 'fallback' || (!ctx.res && url.pathname === '/')) {
    const { renderHtmlFallback } = await loadSsrEntryModule();
    const htmlFallbackStream = await renderHtmlFallback();
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    ctx.res = new Response(htmlFallbackStream, { headers });
  }
}

// cf. `getInput` in packages/waku/src/lib/middleware/handler.ts
async function getInput(ctx: HandlerContext) {
  const url = new URL(ctx.req.url);
  const rscPathPrefix = config.basePath + config.rscBase + '/';
  let rscPath: string | undefined;
  let temporaryReferences: unknown | undefined;
  let input: HandleRequestInput;
  if (url.pathname.startsWith(rscPathPrefix)) {
    rscPath = decodeRscPath(
      decodeURI(url.pathname.slice(rscPathPrefix.length)),
    );
    // server action: js
    const actionId = decodeFuncId(rscPath);
    if (actionId) {
      const body = await getActionBody(ctx.req);
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
        const body = await getActionBody(ctx.req);
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
    const contentType = ctx.req.headers.get('content-type');
    if (
      typeof contentType === 'string' &&
      contentType.startsWith('multipart/form-data')
    ) {
      // server action: no js (progressive enhancement)
      const formData = (await getActionBody(ctx.req)) as FormData;
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

async function getActionBody(req: Request) {
  if (!req.body) {
    throw new Error('missing request body for server function');
  }
  const bodyBuf = await streamToArrayBuffer(req.body);
  const contentType = req.headers.get('content-type');
  if (contentType?.startsWith('multipart/form-data')) {
    return parseFormData(bodyBuf, contentType);
  } else {
    return bufferToString(bodyBuf);
  }
}
