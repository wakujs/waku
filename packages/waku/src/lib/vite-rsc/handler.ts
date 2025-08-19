import {
  createTemporaryReferenceSet,
  decodeReply,
  decodeAction,
  decodeFormState,
  loadServerAction,
} from '@vitejs/plugin-rsc/rsc';
import { stringToStream } from '../utils/stream.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import type { HandlerContext } from '../middleware/types.js';
import { config } from 'virtual:vite-rsc-waku/config';
import { createRenderUtils, loadSsrEntryModule } from './render.js';
import type { HandleRequest } from '../types.js';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { getInput } from '../utils/request.js';

type HandleRequestOutput = Awaited<ReturnType<HandleRequest>>;

export async function handleRequest(ctx: HandlerContext) {
  await import('virtual:vite-rsc-waku/set-platform-data');

  const { input, temporaryReferences } = await getInput(
    ctx,
    config,
    createTemporaryReferenceSet,
    decodeReply,
    decodeAction,
    decodeFormState,
    loadServerAction,
  );

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
