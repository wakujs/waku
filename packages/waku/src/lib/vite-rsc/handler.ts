import {
  createTemporaryReferenceSet,
  decodeAction,
  decodeFormState,
  decodeReply,
  loadServerAction,
  renderToReadableStream,
} from '@vitejs/plugin-rsc/rsc';
import { config } from 'virtual:vite-rsc-waku/config';
import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { createRenderUtils } from '../utils/render.js';
import { getInput } from '../utils/request.js';
import { stringToStream } from '../utils/stream.js';

type HandleRequestOutput = Awaited<ReturnType<HandleRequest>>;

export async function processRequest(req: Request): Promise<Response | null> {
  await import('virtual:vite-rsc-waku/set-platform-data');

  const temporaryReferences = createTemporaryReferenceSet();

  const input = await getInput(
    req,
    config,
    temporaryReferences,
    decodeReply,
    decodeAction,
    decodeFormState,
    loadServerAction,
  );

  const renderUtils = createRenderUtils(
    temporaryReferences,
    renderToReadableStream,
    loadSsrEntryModule,
  );

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
    return new Response(body, { status, headers });
  }

  if (res instanceof ReadableStream) {
    return new Response(res);
  } else if (res && res !== 'fallback') {
    return res;
  }

  // fallback index html like packages/waku/src/lib/plugins/vite-plugin-rsc-index.ts
  const url = new URL(req.url);
  if (res === 'fallback' || (!res && url.pathname === '/')) {
    const { renderHtmlFallback } = await loadSsrEntryModule();
    const htmlFallbackStream = await renderHtmlFallback();
    const headers = { 'content-type': 'text/html; charset=utf-8' };
    return new Response(htmlFallbackStream, { headers });
  }

  return null;
}

function loadSsrEntryModule() {
  // This is an API to communicate between two server environments `rsc` and `ssr`.
  // https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-rsc/README.md#importmetaviterscloadmodule
  return import.meta.viteRsc.loadModule<typeof import('./ssr.js')>(
    'ssr',
    'index',
  );
}
