import type { ReactFormState } from 'react-dom/client';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';

type RenderRsc = Parameters<HandleRequest>[1]['renderRsc'];
type ParseRsc = Parameters<HandleRequest>[1]['parseRsc'];
type RenderHtml = Parameters<HandleRequest>[1]['renderHtml'];

export type RenderHtmlStream = (
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options?: {
    rscPath?: string | undefined;
    formState?: ReactFormState | undefined;
    nonce?: string | undefined;
  },
) => Promise<{ stream: ReadableStream; status: number | undefined }>;

export function createRenderUtils(
  temporaryReferences: unknown,
  renderToReadableStream: (data: unknown, options?: object) => ReadableStream,
  createFromReadableStream: (
    stream: ReadableStream,
    options?: object,
  ) => Promise<unknown>,
  loadSsrEntryModule: () => Promise<{ renderHtmlStream: RenderHtmlStream }>,
): {
  renderRsc: RenderRsc;
  parseRsc: ParseRsc;
  renderHtml: RenderHtml;
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
    async renderRsc(elements) {
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
    async renderHtml(
      elementsStream,
      html,
      options?: { rscPath?: string; actionResult?: any; status?: number },
    ) {
      const ssrEntryModule = await loadSsrEntryModule();

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });

      const htmlResult = await ssrEntryModule.renderHtmlStream(
        elementsStream,
        rscHtmlStream,
        {
          formState: options?.actionResult,
          rscPath: options?.rscPath,
        },
      );
      return new Response(htmlResult.stream, {
        status: htmlResult.status || options?.status || 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  };
}
