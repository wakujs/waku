import type { ReactElement, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { createConfiguredRouter } from '../src/router/create-pages-utils/router.js';
import { createPages } from '../src/router/create-pages.js';
import { serializeRsc } from '../src/server.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: async () => null,
  serializeRsc: vi.fn(async () => new Uint8Array([1])),
}));

describe('createPages router integration', () => {
  it('shares its immutable template cache across concrete routes', async () => {
    vi.mocked(serializeRsc).mockClear();
    const routeRenderer = vi.fn(() => null);
    const router = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'group', name: 'id' }],
          isStatic: false,
          rootElement: { isStatic: true, renderer: () => null },
          routeElement: { isStatic: true, renderer: routeRenderer },
          elements: {
            content: {
              isStatic: false,
              renderer: ({ routePath }) => routePath,
            },
          },
        },
      ],
    });
    const renderRsc = vi.fn(
      async () =>
        new ReadableStream({ start: (controller) => controller.close() }),
    );
    const utils = {
      renderRsc,
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    for (const path of ['/one', '/two']) {
      await router.handleRequest(
        {
          type: 'rsc',
          rscPath: 'R' + path,
          rscParams: undefined,
          pathname: '/RSC/payload.txt',
          req: new Request('http://localhost/RSC/payload.txt'),
        },
        utils,
      );
    }
    expect(routeRenderer).toHaveBeenCalledTimes(1);
    expect(serializeRsc).toHaveBeenCalledTimes(2);
    expect(renderRsc).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '/two' }),
      expect.anything(),
    );
  });

  it('matches a route or an api only by its normalized path', async () => {
    const routeRenderer = vi.fn(() => null);
    const apiHandler = vi.fn(async () => new Response('secret'));
    const router = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [
            { type: 'literal', name: 'users' },
            { type: 'group', name: 'id' },
          ],
          isStatic: false,
          rootElement: { isStatic: false, renderer: () => null },
          routeElement: { isStatic: false, renderer: routeRenderer },
          elements: {},
        },
        {
          type: 'api',
          pathSpec: [
            { type: 'literal', name: 'api' },
            { type: 'literal', name: 'secret' },
          ],
          isStatic: false,
          handler: apiHandler,
        },
      ],
    });
    const utils = {
      renderRsc: vi.fn(
        async () =>
          new ReadableStream({ start: (controller) => controller.close() }),
      ),
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    const requestRoute = (rscPath: string) =>
      router.handleRequest(
        {
          type: 'rsc',
          rscPath,
          rscParams: undefined,
          pathname: '/RSC/payload.txt',
          req: new Request('http://localhost/RSC/payload.txt'),
        },
        utils,
      );
    const requestApi = (pathname: string) =>
      router.handleRequest(
        {
          type: 'http',
          pathname,
          req: new Request('http://localhost' + pathname),
        },
        utils,
      );

    for (const rscPath of [
      'R/users/123/',
      'R/users/123//',
      'R/users/123/index.html',
      'Rusers/123',
      'Rx/users/123',
    ]) {
      expect(await requestRoute(rscPath), rscPath).toBeNull();
    }
    expect(routeRenderer).not.toHaveBeenCalled();
    expect(await requestRoute('R/users/123')).not.toBeNull();
    expect(routeRenderer).toHaveBeenCalledOnce();

    for (const pathname of [
      '/api/secret///',
      '/api/secret/index.html/index.html',
    ]) {
      expect(await requestApi(pathname), pathname).toBeNull();
    }
    expect(apiHandler).not.toHaveBeenCalled();
    for (const pathname of ['/api/secret', '/api/secret/']) {
      expect(await requestApi(pathname), pathname).toBeInstanceOf(Response);
    }
    expect(apiHandler).toHaveBeenCalledTimes(2);
  });

  it('keeps the request query out of a static element of a dynamic route', async () => {
    const staticRenderer = vi.fn(() => null);
    const dynamicRenderer = vi.fn(() => null);
    const router = createConfiguredRouter({
      getConfigs: async () => [
        {
          type: 'route',
          pathSpec: [{ type: 'literal', name: 'foo' }],
          isStatic: false,
          rootElement: { isStatic: false, renderer: dynamicRenderer },
          routeElement: { isStatic: true, renderer: () => null },
          elements: {
            'page:/foo': { isStatic: true, renderer: staticRenderer },
          },
        },
      ],
    });
    const utils = {
      renderRsc: vi.fn(
        async () =>
          new ReadableStream({ start: (controller) => controller.close() }),
      ),
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    for (const query of ['x=first', 'x=second']) {
      await router.handleRequest(
        {
          type: 'rsc',
          rscPath: 'R/foo',
          rscParams: new URLSearchParams({ query }),
          pathname: '/RSC/payload.txt',
          req: new Request('http://localhost/RSC/payload.txt'),
        },
        utils,
      );
    }
    expect(staticRenderer.mock.calls).toEqual([
      [{ routePath: '/foo', query: undefined }],
    ]);
    expect(dynamicRenderer.mock.calls).toEqual([
      [{ routePath: '/foo', query: 'x=first' }],
      [{ routePath: '/foo', query: 'x=second' }],
    ]);
  });

  it('renders a static page under a dynamic root without the request query', async () => {
    vi.mocked(serializeRsc).mockClear();
    const Page = () => null;
    const Root = ({ children }: { children: ReactNode }) => children;
    const router = createPages(async ({ createPage, createRoot }) => [
      createRoot({ render: 'dynamic', component: Root }),
      createPage({ render: 'static', path: '/foo', component: Page }),
    ]);
    const utils = {
      renderRsc: vi.fn(
        async () =>
          new ReadableStream({ start: (controller) => controller.close() }),
      ),
      renderHtml: vi.fn(),
      renderHtmlFallback: vi.fn(),
      loadBuildMetadata: vi.fn(),
    };
    for (const query of ['x=first', 'x=second']) {
      await router.handleRequest(
        {
          type: 'rsc',
          rscPath: 'R/foo',
          rscParams: new URLSearchParams({ query }),
          pathname: '/RSC/payload.txt',
          req: new Request('http://localhost/RSC/payload.txt'),
        },
        utils,
      );
    }
    const serializedPages = vi
      .mocked(serializeRsc)
      .mock.calls.map(([element]) => element as ReactElement)
      .filter((element) => element?.type === Page);
    expect(serializedPages).toHaveLength(1);
    expect(serializedPages[0]!.props).toMatchObject({ path: '/foo' });
    expect(serializedPages[0]!.props).not.toHaveProperty('query');
  });
});
