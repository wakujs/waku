import type { Unstable_RenderHtml as RenderHtml } from 'waku/minimal/server';
import { getServerInsertedHTML, serverInsertedHTMLStorage } from './context';
import type { ServerInsertedHTMLStore } from './context';
import { createHeadInsertionTransformStream } from './stream';

export function injectRenderHtml(renderHtml: RenderHtml): RenderHtml {
  if (!import.meta.env.SSR) {
    return renderHtml;
  }

  return async (elementsStream, html, options) => {
    const store: ServerInsertedHTMLStore = { callbacks: [] };
    return serverInsertedHTMLStorage.run(store, async () => {
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
        createHeadInsertionTransformStream(() => getServerInsertedHTML(store)),
      );

      return new Response(transformedStream, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    });
  };
}
