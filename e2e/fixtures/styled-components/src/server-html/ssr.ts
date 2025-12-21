import 'client-only';
import { unstable_defineHandlers as defineHandlers } from 'waku/minimal/server';
import { getServerInsertedHTML, serverInsertedHTMLStorage } from './context';
import { createHeadInsertionTransformStream } from './stream';

type Handlers = ReturnType<typeof defineHandlers>;
type RenderHtml = Parameters<Handlers['handleRequest']>[1]['renderHtml'];

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

export function cssInJs(handlers: Handlers) {
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
