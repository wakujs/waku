import type { ReactFormState } from 'react-dom/client';
import type { Unstable_HandleRequest as HandleRequest } from '../types.js';

type RenderUtils = Parameters<HandleRequest>[1];
type RenderHTML = (
  rscStream: ReadableStream<Uint8Array>,
  rscHtmlStream: ReadableStream<Uint8Array>,
  options?: {
    rscPath?: string | undefined;
    formState?: ReactFormState | undefined;
    nonce?: string | undefined;
  },
) => Promise<ReadableStream>;

export function createRenderUtils(
  temporaryReferences: unknown,
  renderToReadableStream: (data: unknown, options?: object) => ReadableStream,
  loadSsrEntryModule: () => Promise<{ renderHTML: RenderHTML }>,
): Pick<RenderUtils, 'renderRsc' | 'renderHtml'> {
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
      elements,
      html,
      options?: { rscPath?: string; actionResult?: any; status?: number },
    ) {
      const ssrEntryModule = await loadSsrEntryModule();

      const rscElementsStream = renderToReadableStream(elements, {
        onError,
      });

      const rscHtmlStream = renderToReadableStream(html, {
        onError,
      });

      const htmlStream = await ssrEntryModule.renderHTML(
        rscElementsStream,
        rscHtmlStream,
        {
          formState: options?.actionResult,
          rscPath: options?.rscPath,
        },
      );
      return new Response(htmlStream, {
        status: options?.status || 200,
        headers: { 'content-type': 'text/html' },
      });
    },
  };
}
