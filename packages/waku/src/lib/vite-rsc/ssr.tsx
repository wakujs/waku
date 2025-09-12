import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr';
import { captureOwnerStack, use, type ReactNode } from 'react';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server.edge';
import { INTERNAL_ServerRoot } from '../../minimal/client.js';
import { fakeFetchCode } from '../renderers/html.js';
import { injectRSCPayload } from 'rsc-html-stream/server';
import fallbackHtml from 'virtual:vite-rsc-waku/fallback-html';

type RscElementsPayload = Record<string, unknown>;
type RscHtmlPayload = ReactNode;

// This code runs on `ssr` environment,
// i.e. it runs on server but without `react-server` condition.
// These utilities are used by `rsc` environment through
// `import.meta.viteRsc.loadModule` API.

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options?: {
    rscPath?: string | undefined;
    formState?: ReactFormState | undefined;
    nonce?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
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
    // `HtmlNodeWrapper` is for a workaround.
    // https://github.com/facebook/react/issues/33937
    return (
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        <HtmlNodeWrapper>{use(htmlPromise)}</HtmlNodeWrapper>
      </INTERNAL_ServerRoot>
    );
  }

  // render html
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  const htmlStream = await renderToReadableStream(<SsrRoot />, {
    bootstrapScriptContent:
      getBootstrapPreamble({ rscPath: options?.rscPath || '' }) +
      bootstrapScriptContent,
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

  let responseStream: ReadableStream<Uint8Array> = htmlStream;
  responseStream = responseStream.pipeThrough(
    injectRSCPayload(stream2, options?.nonce ? { nonce: options?.nonce } : {}),
  );

  return responseStream;
}

// HACK: This is only for a workaround.
// https://github.com/facebook/react/issues/33937
function HtmlNodeWrapper(props: { children: ReactNode }) {
  return props.children;
}

// cf. packages/waku/src/lib/renderers/html.ts `parseHtmlHead`
function getBootstrapPreamble(options: { rscPath: string }) {
  return `
    globalThis.__WAKU_HYDRATE__ = true;
    globalThis.__WAKU_PREFETCHED__ = {
      ${JSON.stringify(options.rscPath)}: ${fakeFetchCode}
    };
  `;
}

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
