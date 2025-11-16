import type { ReactFormState } from 'react-dom/client';
import type { Unstable_RenderHtml, Unstable_RenderRsc } from '../types.js';

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
  loadSsrEntryModule: () => Promise<{ renderHtmlStream: RenderHtmlStream }>,
): {
  renderRsc: Unstable_RenderRsc;
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
    async renderRsc(elements) {
      return renderToReadableStream(elements, {
        temporaryReferences,
        onError,
      });
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
