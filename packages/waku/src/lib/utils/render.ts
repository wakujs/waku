import type {
  Unstable_ParseRsc,
  Unstable_RenderHtml,
  Unstable_RenderRsc,
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
): {
  renderRsc: Unstable_RenderRsc;
  parseRsc: Unstable_ParseRsc;
  renderHtml: Unstable_RenderHtml;
} {
  const onError = (e: unknown) => {
    console.error('Error during rendering:', e);
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
    async renderRsc(elements, options) {
      return renderToReadableStream(
        elements,
        {
          temporaryReferences,
          onError,
        },
        {
          onClientReference(metadata: {
            id: string;
            name: string;
            deps: { js: string[]; css: string[] };
          }) {
            options?.unstable_moduleIdsCallback?.(metadata.deps.js);
          },
        },
      );
    },
    async parseRsc(stream) {
      return createFromReadableStream(stream, {}) as Promise<
        Record<string, unknown>
      >;
    },
    async renderHtml(
      elementsStream,
      html,
      options?: { rscPath?: string; actionResult?: any; status?: number },
    ) {
      const { INTERNAL_renderHtmlStream: renderHtmlStream } =
        await loadSsrEntryModule();

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });
      const htmlResult = await renderHtmlStream(elementsStream, rscHtmlStream, {
        formState: options?.actionResult,
        rscPath: options?.rscPath,
      });
      return new Response(htmlResult.stream, {
        status: htmlResult.status || options?.status || 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  };
}
