import { getServerInsertedHTML, serverInsertedHTMLStorage } from './context';
import { createHeadInsertionTransformStream } from './stream';

export default async function enhanceRenderHtml(
  render: () => Promise<Response>,
): Promise<Response> {
  if (!import.meta.env.SSR) {
    return render();
  }

  return serverInsertedHTMLStorage.run({ callbacks: [] }, async () => {
    // Bridge for 'use client' components to register callbacks without importing Node.js built-ins
    globalThis.__addServerInsertedHTML = (callback) => {
      serverInsertedHTMLStorage.getStore()?.callbacks.push(callback);
    };

    const response = await render();

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
}
