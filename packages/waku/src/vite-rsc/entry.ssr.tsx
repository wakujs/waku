import * as ReactClient from '@vitejs/plugin-rsc/ssr';
import React from 'react';
import type { ReactFormState } from 'react-dom/client';
import * as ReactDOMServer from 'react-dom/server.edge';
import { INTERNAL_ServerRoot } from '../minimal/client.js';
import type { RscElementsPayload, RscHtmlPayload } from './entry.rsc.js';
import { fakeFetchCode } from '../lib/renderers/html.js';
import { injectRSCPayload } from 'rsc-html-stream/server';

export async function renderHTML(
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options?: {
    rscPath?: string | undefined;
    formState?: ReactFormState | undefined;
    nonce?: string | undefined;
  },
): Promise<ReadableStream<Uint8Array>> {
  // cf. packages/waku/src/lib/renderers/html.ts `renderHtml`

  const [stream1, stream2] = rscStream.tee();

  let elementsPromise: Promise<RscElementsPayload>;
  let htmlPromise: Promise<RscHtmlPayload>;

  // deserialize RSC stream back to React VDOM
  function SsrRoot() {
    // RSC stream needs to be deserialized inside SSR component
    // for ReactDomServer preinit/preload (e.g. client reference modulepreload, css)
    elementsPromise ??=
      ReactClient.createFromReadableStream<RscElementsPayload>(stream1);
    htmlPromise ??=
      ReactClient.createFromReadableStream<RscHtmlPayload>(rscHtmlStream);
    return (
      <INTERNAL_ServerRoot elementsPromise={elementsPromise}>
        {React.use(htmlPromise)}
      </INTERNAL_ServerRoot>
    );
  }

  // render html (traditional SSR)
  const bootstrapScriptContent =
    await import.meta.viteRsc.loadBootstrapScriptContent('index');

  function renderHtmlInner() {
    return ReactDOMServer.renderToReadableStream(<SsrRoot />, {
      bootstrapScriptContent:
        getBootstrapPreamble({ rscPath: options?.rscPath || '' }) +
        bootstrapScriptContent,
      nonce: options?.nonce,
      onError: (e: unknown) => {
        if (
          e &&
          typeof e === 'object' &&
          'digest' in e &&
          typeof e.digest === 'string'
        ) {
          return e.digest;
        }
        console.error(
          '[SSR Error]',
          React.captureOwnerStack?.() || '',
          '\n',
          e,
        );
      },
      // no types
      ...{ formState: options?.formState },
    } as any);
  }

  const htmlStream = await withHackSsrRetry(renderHtmlInner)();

  let responseStream: ReadableStream<Uint8Array> = htmlStream;
  responseStream = responseStream.pipeThrough(
    injectRSCPayload(stream2, {
      nonce: options?.nonce,
    } as any),
  );

  return responseStream;
}

// see https://github.com/wakujs/waku/pull/1534
let hackSsrRetry = 1;

function withHackSsrRetry<F extends (...args: any[]) => Promise<any>>(fn: F): F {
  return async function withRetryWrapper(this: any, ...args): Promise<any> {
    try {
      return await fn.apply(this, args);
    } catch (e) {
      if (hackSsrRetry) {
        hackSsrRetry--;
        return withRetryWrapper.apply(this, args);
      }
      throw e;
    }
  } as F;
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
  const bootstrapScriptContent =
    await import.meta.viteRsc.loadBootstrapScriptContent('index');
  const fallback = (
    <html>
      <body></body>
    </html>
  );
  const htmlStream = await ReactDOMServer.renderToReadableStream(fallback, {
    bootstrapScriptContent,
  } as any);
  return htmlStream;
}
