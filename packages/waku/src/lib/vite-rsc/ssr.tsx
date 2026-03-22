import { type ReactNode, captureOwnerStack, use } from 'react';
import { createFromReadableStream } from '@vitejs/plugin-rsc/ssr';
import type { ReactFormState } from 'react-dom/client';
import { renderToReadableStream } from 'react-dom/server.edge';
import { injectRSCPayload } from 'rsc-html-stream/server';
import fallbackHtml from 'virtual:vite-rsc-waku/fallback-html';
import { INTERNAL_ServerRoot } from '../../minimal/client.js';
import { getErrorInfo } from '../utils/custom-errors.js';
import { getBootstrapPreamble } from '../utils/ssr.js';
import { batchReadableStream } from '../utils/stream.js';

type RenderHtmlStream = (
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options: {
    rscPath: string | undefined;
    formState: ReactFormState | undefined;
    nonce: string | undefined;
    extraScriptContent: string | undefined;
    debugId: string | undefined;
  },
) => Promise<{ stream: ReadableStream; status: number | undefined }>;

type RscElementsPayload = Record<string, unknown>;
type RscHtmlPayload = ReactNode;

const createPendingPromise = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return [promise, resolve] as const;
};

const deferReadableStream = (
  stream: ReadableStream<Uint8Array>,
  promise: Promise<void>,
) => {
  const reader = stream.getReader();
  let canceled = false;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          await promise;
          if (!canceled) {
            controller.close();
          }
          reader.releaseLock();
          return;
        }
        if (!canceled) {
          controller.enqueue(value);
        }
      } catch (error) {
        if (!canceled) {
          controller.error(error);
        }
        reader.releaseLock();
      }
    },
    async cancel(reason) {
      canceled = true;
      try {
        await reader.cancel(reason);
      } finally {
        reader.releaseLock();
      }
    },
  });
};

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
  // React canary treats an early Flight close as a hard protocol failure.
  // Keep the elements stream open until client-reference resolution finishes.
  const [pendingPromise, resolvePending] = createPendingPromise();
  const deferredStream1 = deferReadableStream(stream1, pendingPromise);

  let elementsPromise: Promise<RscElementsPayload>;
  let htmlPromise: Promise<RscHtmlPayload>;

  // deserialize RSC stream back to React VDOM
  function SsrRoot() {
    // RSC stream needs to be deserialized inside SSR component.
    // This is for ReactDomServer preinit/preload (e.g. client reference modulepreload, css)
    // https://github.com/facebook/react/pull/31799#discussion_r1886166075
    elementsPromise ??=
      createFromReadableStream<RscElementsPayload>(deferredStream1);
    htmlPromise ??= createFromReadableStream<RscHtmlPayload>(rscHtmlStream);
    return (
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        {use(htmlPromise)}
      </INTERNAL_ServerRoot>
    );
  }

  // render html
  const bootstrapScriptContent = await loadBootstrapScriptContent();
  let htmlStream: Awaited<ReturnType<typeof renderToReadableStream>>;
  let status: number | undefined;
  try {
    htmlStream = await renderToReadableStream(<SsrRoot />, {
      bootstrapScriptContent:
        getBootstrapPreamble({
          rscPath: options.rscPath || '',
          hydrate: true,
          debugId: options.debugId,
        }) +
        bootstrapScriptContent +
        (options.extraScriptContent || ''),
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
      ...(options.nonce ? { nonce: options.nonce } : {}),
      ...(options.formState ? { formState: options.formState } : {}),
    });
    // Temporary workaround: this doesn't feel ideal,
    // but it is the only available signal we have for now.
    // TODO The real fix would be a narrower hook from @vitejs/plugin-rsc
    // for async client-reference resolution?
    htmlStream.allReady.then(resolvePending, resolvePending);
  } catch (e) {
    resolvePending();
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
          rscPath: options.rscPath || '',
          hydrate: false,
        }) +
        bootstrapScriptContent +
        (options.extraScriptContent || ''),
      ...(options.nonce ? { nonce: options.nonce } : {}),
    });
  }
  const responseStream: ReadableStream<Uint8Array> = htmlStream.pipeThrough(
    injectRSCPayload(
      batchReadableStream(stream2),
      options.nonce ? { nonce: options.nonce } : {},
    ),
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
