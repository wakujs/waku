import { describe, expect, it, vi } from 'vitest';
import {
  unstable_defineRouter,
  unstable_rerenderRoute,
} from '../src/router/define-router.js';
import { ROUTE_ID } from '../src/router/common.js';

const requestContext = vi.hoisted(() => ({}));

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
  unstable_getContext: vi.fn(() => requestContext),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

describe('define-router action requests', () => {
  it('sets router initial route for 404 HTML', async () => {
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [{ type: 'literal' as const, name: '404' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {},
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    const renderHtml = vi.fn().mockResolvedValue(new Response('ok'));

    await handleRequest(
      {
        type: 'custom',
        pathname: '/missing',
        req: new Request('http://localhost/missing'),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml,
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({ [ROUTE_ID]: ['/404', ''] }),
    );
    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({ status: 404 }),
    );
  });

  it('allows no-JS form actions to rerender a route', async () => {
    let message = 'before';
    const renderPage = vi.fn(() => `page:${message}`);
    const { handleRequest } = unstable_defineRouter({
      getConfigs: async () => [
        {
          type: 'route' as const,
          path: [],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => 'root' },
          routeElement: { isStatic: false, renderer: () => 'route' },
          elements: {
            'page:/': { isStatic: false, renderer: renderPage },
          },
        },
      ],
    });

    const renderRsc = vi.fn().mockResolvedValue(makeStream());
    const renderHtml = vi.fn().mockResolvedValue(new Response('ok'));

    const res = await handleRequest(
      {
        type: 'action',
        fn: async () => {
          message = 'after';
          unstable_rerenderRoute('/');
          return 'form-state';
        },
        pathname: '/',
        req: new Request('http://localhost/', { method: 'POST' }),
      },
      {
        renderRsc,
        parseRsc: vi.fn(),
        renderHtml,
        loadBuildMetadata: vi.fn(),
      },
    );

    expect(res).toBeInstanceOf(Response);
    expect(renderPage).toHaveBeenCalledTimes(2);
    expect(renderRsc).toHaveBeenCalledWith(
      expect.objectContaining({
        'page:/': 'page:after',
      }),
    );
    expect(renderHtml).toHaveBeenCalledWith(
      expect.any(ReadableStream),
      expect.anything(),
      expect.objectContaining({
        formState: 'form-state',
      }),
    );
  });
});
