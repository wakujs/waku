import 'client-only';
import type { ReactNode } from 'react';
import { getServerInsertedHTML, serverInsertedHTMLStorage } from './context';
import { createHeadInsertionTransformStream } from './stream';

type RenderHtml = (
  elementsStream: ReadableStream,
  html: ReactNode,
  options: {
    rscPath: string;
    actionResult?: unknown;
    status?: number;
  },
) => Promise<Response>;

export function injectRenderHtml(renderHtml: RenderHtml): RenderHtml {
  if (!import.meta.env.SSR) {
    return renderHtml;
  }

  return async (elementsStream, html, options) => {
    return serverInsertedHTMLStorage.run({ callbacks: [] }, async () => {
      // Bridge for 'use client' components to register callbacks without importing Node.js built-ins
      globalThis.__addServerInsertedHTML = (callback) => {
        serverInsertedHTMLStorage.getStore()?.callbacks.push(callback);
      };

      const response = await renderHtml(elementsStream, html, options);

      const body = response.body;
      if (!body) {
        return response;
      }

      const transformedStream = body.pipeThrough(
        createHeadInsertionTransformStream(getServerInsertedHTML),
      );

      return new Response(transformedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  };
}
