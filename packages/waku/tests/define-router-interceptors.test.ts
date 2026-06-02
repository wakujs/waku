import type { ReactNode } from 'react';
import { createElement } from 'react';
import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, expect, it, vi } from 'vitest';
import { createPages } from '../src/router/create-pages.js';
import {
  type HandlerInterceptor,
  unstable_defineRouter,
} from '../src/router/define-router.js';

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    },
  });

const make404Router = (
  renderer: () => ReactNode,
  unstable_interceptors: HandlerInterceptor[],
) =>
  unstable_defineRouter({
    getConfigs: async () => [
      {
        type: 'route' as const,
        path: [{ type: 'literal' as const, name: '404' }],
        isStatic: false,
        rootElement: { isStatic: false, renderer: () => 'root' },
        routeElement: { isStatic: false, renderer },
        elements: {},
      },
    ],
    unstable_interceptors,
  });

const callHandleRequest = (
  router: ReturnType<typeof unstable_defineRouter>,
  pathname = '/missing',
) =>
  router.handleRequest(
    {
      type: 'custom',
      pathname,
      req: new Request(`http://localhost${pathname}`),
    },
    {
      renderRsc: vi.fn().mockResolvedValue(makeStream()),
      parseRsc: vi.fn(),
      renderHtml: vi.fn().mockResolvedValue(new Response('ok')),
      loadBuildMetadata: vi.fn(),
    },
  );

describe('define-router handler interceptors', () => {
  it('runs interceptors around the handler in order (outermost first)', async () => {
    const order: string[] = [];
    const router = make404Router(() => {
      order.push('render');
      return 'route';
    }, [
      async (next) => {
        order.push('a:before');
        const res = await next();
        order.push('a:after');
        return res;
      },
      async (next) => {
        order.push('b:before');
        const res = await next();
        order.push('b:after');
        return res;
      },
    ]);

    await callHandleRequest(router);

    expect(order[0]).toBe('a:before');
    expect(order[1]).toBe('b:before');
    expect(order.includes('render')).toBe(true);
    expect(order.at(-1)).toBe('a:after');
    expect(order.at(-2)).toBe('b:after');
  });

  it('exposes an interceptor-established ALS to the render', async () => {
    const als = new AsyncLocalStorage<string>();
    let seen: string | undefined;
    const router = make404Router(() => {
      seen = als.getStore();
      return 'route';
    }, [(next) => als.run('from-interceptor', next)]);

    await callHandleRequest(router);

    expect(seen).toBe('from-interceptor');
  });

  it('runs createInterceptor-registered interceptors in createPages', async () => {
    const calls: string[] = [];
    const router = createPages(async ({ createPage, createInterceptor }) => {
      createInterceptor(async (next) => {
        calls.push('intercept');
        return next();
      });
      return [
        createPage({
          render: 'dynamic',
          path: '/',
          component: () => createElement('div'),
        }),
      ];
    });

    await callHandleRequest(router, '/');

    expect(calls).toEqual(['intercept']);
  });
});
