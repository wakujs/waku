import { type ReactNode, captureOwnerStack, use } from 'react';
import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr';
import { renderToReadableStream } from 'react-dom/server.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';
import fallbackHtml from 'virtual:vite-rsc-waku/fallback-html';
import { INTERNAL_ServerRoot } from '../../minimal/client.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import type { RenderHtmlStream } from '../utils/render.js';
import { getBootstrapPreamble } from '../utils/ssr.js';

type RscElementsPayload = Record<string, unknown>;
type RscHtmlPayload = ReactNode;

// This code runs on `ssr` environment,
// i.e. it runs on server but without `react-server` condition.
// These utilities are used by `rsc` environment through
// `import.meta.viteRsc.loadModule` API.

export const renderHtmlStream: RenderHtmlStream = async (
  rscStream,
  rscHtmlStream,
  options,
) => {
  const [stream1, stream2] = rscStream.tee();

  let elementsPromise: Promise<RscElementsPayload>;
  let htmlPromise: Promise<RscHtmlPayload>;

  // deserialize RSC stream back to React VDOM
  function SsrRoot() {
    // RSC stream needs to be deserialized inside SSR component.
    // This is for ReactDomServer preinit/preload (e.g. client reference modulepreload, css)
    // https://github.com/facebook/react/pull/31799#discussion_r1886166075
    elementsPromise ??= createFromReadableStream<RscElementsPayload>(stream1);
    htmlPromise ??= createFromReadableStream<RscHtmlPayload>(rscHtmlStream);
    return (
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        {use(htmlPromise)}
      </INTERNAL_ServerRoot>
    );
  }

  // render html
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  let htmlStream: ReadableStream;
  let status: number | undefined;
  try {
    htmlStream = await renderToReadableStream(<SsrRoot />, {
      bootstrapScriptContent:
        getBootstrapPreamble({
          rscPath: options?.rscPath || '',
          hydrate: true,
        }) + bootstrapScriptContent,
      onError: (e: unknown) => {
        if (
          e &&
          typeof e === 'object' &&
          'digest' in e &&
          typeof e.digest === 'string'
        ) {
          return e.digest;
        }
        console.error('[SSR Error]', captureOwnerStack?.() || '', '\n', e);
      },
      ...(options?.nonce ? { nonce: options.nonce } : {}),
      ...(options?.formState ? { formState: options.formState } : {}),
    });
  } catch (e) {
    const info = getErrorInfo(e);
    if (info?.location) {
      // keep unstable_redirect error as http redirection
      throw e;
    }
    status = info?.status || 500;
    // SSR empty html and go full CSR on browser, which can revive RSC errors.
    const ssrErrorRoot = (
      <html>
        <body></body>
      </html>
    );
    htmlStream = await renderToReadableStream(ssrErrorRoot, {
      bootstrapScriptContent:
        getBootstrapPreamble({
          rscPath: options?.rscPath || '',
          hydrate: false,
        }) + bootstrapScriptContent,
      ...(options?.nonce ? { nonce: options.nonce } : {}),
    });
  }
  let responseStream: ReadableStream<Uint8Array> = htmlStream;
  responseStream = responseStream.pipeThrough(
    injectRSCPayload(stream2, options?.nonce ? { nonce: options?.nonce } : {}),
  );

  return { stream: responseStream, status };
};

export async function renderHtmlFallback() {
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  const html = fallbackHtml.replace(
    '</body>',
    () => `<script>${bootstrapScriptContent}</script></body>`,
  );
  return html;
}

function loadBootstrapScriptContent(): Promise<string> {
  return import.meta.viteRsc.loadBootstrapScriptContent('index');
}
