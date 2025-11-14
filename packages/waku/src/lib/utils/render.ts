import type { ReactFormState } from 'react-dom/client';
import type { RenderUtils } from '../types.js';

export type RenderHtml = (
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
  loadSsrEntryModule: () => Promise<{ renderHtml: RenderHtml }>,
): RenderUtils {
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

  const renderUtils: RenderUtils = {
    async renderRsc(elements) {
      return renderToReadableStream(elements, {
        temporaryReferences,
        onError,
      });
    },
    async renderHtml(elementsStream, html, options) {
      const ssrEntryModule = await loadSsrEntryModule();

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });

      const htmlResult = await ssrEntryModule.renderHtml(
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

  return renderUtils;
}
