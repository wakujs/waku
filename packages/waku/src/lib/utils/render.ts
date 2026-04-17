import type {
  Unstable_ParseRsc,
  Unstable_RenderHtml,
  Unstable_RenderRsc,
  Unstable_RenderRscForParse,
} from '../types.js';

export function createRenderUtils(
  temporaryReferences: unknown,
  renderToReadableStream: (
    data: unknown,
    options?: object,
    extraOptions?: object,
  ) => ReadableStream,
  createFromReadableStream: (
    stream: ReadableStream,
    options?: object,
  ) => Promise<unknown>,
  loadSsrEntryModule: () => Promise<
    typeof import('../vite-entries/entry.ssr.js')
  >,
  debugChannel?: { readable?: ReadableStream; writable?: WritableStream },
  debugId?: string,
): {
  renderRsc: Unstable_RenderRsc;
  renderRscForParse: Unstable_RenderRscForParse;
  parseRsc: Unstable_ParseRsc;
  renderHtml: Unstable_RenderHtml;
} {
  const onError = (e: unknown) => {
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof e.digest === 'string'
    ) {
      return e.digest;
    }
    console.error('Error during rendering:', e);
  };

  return {
    async renderRsc(elements, options) {
      return renderToReadableStream(
        elements,
        {
          temporaryReferences,
          onError,
          debugChannel,
        },
        {
          onClientReference(metadata: {
            id: string;
            name: string;
            deps: { js: string[]; css: string[] };
          }) {
            options?.unstable_clientModuleCallback?.(metadata.deps.js);
          },
        },
      );
    },
    async renderRscForParse(elements) {
      return renderToReadableStream(elements, {
        temporaryReferences,
        onError,
      });
    },
    async parseRsc(stream) {
      return createFromReadableStream(stream, {}) as Promise<
        Record<string, unknown>
      >;
    },
    async renderHtml(elementsStream, html, options) {
      const { INTERNAL_renderHtmlStream: renderHtmlStream } =
        await loadSsrEntryModule();

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });
      const htmlResult = await renderHtmlStream(elementsStream, rscHtmlStream, {
        rscPath: options.rscPath,
        formState: options.formState as never,
        nonce: options.nonce,
        extraScriptContent: options.unstable_extraScriptContent,
        debugId,
      });
      return new Response(htmlResult.stream, {
        status: htmlResult.status || options.status || 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  };
}
