import * as ReactServer from '@vitejs/plugin-rsc/rsc';
import { captureOwnerStack, type ReactNode } from 'react';
import type { HandleRequest } from '../../lib/types.js';

export type RscElementsPayload = Record<string, unknown>;
export type RscHtmlPayload = ReactNode;
export type RenderUtils = Parameters<HandleRequest>[1];

export function createRenderUtils({
  temporaryReferences,
}: {
  temporaryReferences?: unknown;
}): RenderUtils {
  const onError = (e: unknown) => {
    if (
      e &&
      typeof e === 'object' &&
      'digest' in e &&
      typeof e.digest === 'string'
    ) {
      return e.digest;
    }
    console.error('[RSC Error]', captureOwnerStack?.() || '', '\n', e);
  };

  return {
    async renderRsc(elements) {
      return ReactServer.renderToReadableStream<RscElementsPayload>(elements, {
        temporaryReferences,
        onError,
      });
    },
    async renderHtml(
      elements,
      html,
      options?: { rscPath?: string; actionResult?: any },
    ) {
      const ssrEntryModule = await loadSsrEntryModule();

      const rscElementsStream =
        ReactServer.renderToReadableStream<RscElementsPayload>(elements, {
          onError,
        });

      const rscHtmlStream = ReactServer.renderToReadableStream<RscHtmlPayload>(
        html,
        { onError },
      );

      const htmlStream = await ssrEntryModule.renderHTML(
        rscElementsStream,
        rscHtmlStream,
        {
          formState: options?.actionResult,
          rscPath: options?.rscPath,
        },
      );
      return {
        body: htmlStream as any,
        headers: { 'content-type': 'text/html' },
      };
    },
  };
}

export function loadSsrEntryModule() {
  return import.meta.viteRsc.loadModule<typeof import('./ssr.js')>(
    'ssr',
    'index',
  );
}
