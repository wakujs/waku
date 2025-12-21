import 'client-only';
import type { ReactNode } from 'react';
import { unstable_defineHandlers as defineHandlers } from 'waku/minimal/server';
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

function injectRenderHtml(renderHtml: RenderHtml): RenderHtml {
  if (!import.meta.env.SSR) {
    return renderHtml;
  }

  return async (elementsStream, html, options) => {
    return serverInsertedHTMLStorage.run({ callbacks: [] }, async () => {
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

export function cssInJs(handlers: ReturnType<typeof defineHandlers>) {
  return defineHandlers({
    handleRequest(input, utils) {
      return handlers.handleRequest(input, {
        ...utils,
        renderHtml: injectRenderHtml(utils.renderHtml),
      });
    },
    handleBuild(utils) {
      return handlers.handleBuild({
        ...utils,
        renderHtml: injectRenderHtml(utils.renderHtml),
      });
    },
  });
}
