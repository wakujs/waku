import { readFile } from 'node:fs/promises';
import adapter from 'waku/adapters/default';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import BarPage from './components/BarPage';
import FooPage from './components/FooPage';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';
import NestedBazPage from './components/NestedBazPage';
import Root from './components/Root';

export default adapter(
  defineRouter({
    getConfig: async () => [
      {
        type: 'route',
        pattern: '/',
        path: [],
        isStatic: true,
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/': { isStatic: true },
        },
      },
      {
        type: 'route',
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        isStatic: true,
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/foo': { isStatic: true },
        },
      },
      {
        type: 'route',
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        isStatic: true,
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/bar': { isStatic: true },
        },
      },
      {
        type: 'route',
        pattern: '/nested/baz',
        path: [
          { type: 'literal', name: 'nested' },
          { type: 'literal', name: 'baz' },
        ],
        isStatic: true,
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/nested/baz': { isStatic: true },
        },
      },
      {
        type: 'route',
        pattern: '/dynamic/([^/]+)',
        path: [
          { type: 'literal', name: 'dynamic' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          // using `[slug]` syntax is just an example and it technically conflicts with others. So, it's better to use a different prefix like `dynamic-page:`.
          'page:/dynamic/[slug]': {},
        },
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'hi' },
        ],
        isStatic: false,
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'hi.txt' },
        ],
        isStatic: true,
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'empty' },
        ],
        isStatic: false,
      },
    ],
    handleRoute: async (path) => {
      if (path === '/') {
        return {
          renderRoot: () => (
            <Root>
              <Children />
            </Root>
          ),
          renderRoute: () => (
            <Slot id="layout:/">
              <Slot id="page:/" />
            </Slot>
          ),
          renderers: {
            'layout:/': () => (
              <HomeLayout>
                <Children />
              </HomeLayout>
            ),
            'page:/': () => <HomePage />,
          },
        };
      }
      if (path === '/foo') {
        return {
          renderRoot: () => (
            <Root>
              <Children />
            </Root>
          ),
          renderRoute: () => (
            <Slot id="layout:/">
              <Slot id="page:/foo" />
            </Slot>
          ),
          renderers: {
            'layout:/': () => (
              <HomeLayout>
                <Children />
              </HomeLayout>
            ),
            'page:/foo': () => <FooPage />,
          },
        };
      }
      if (path === '/bar') {
        return {
          renderRoot: () => (
            <Root>
              <Children />
            </Root>
          ),
          renderRoute: () => (
            <Slot id="layout:/">
              <Slot id="page:/bar" />
            </Slot>
          ),
          renderers: {
            'layout:/': () => (
              <HomeLayout>
                <Children />
              </HomeLayout>
            ),
            'page:/bar': () => <BarPage />,
          },
        };
      }
      if (path === '/nested/baz') {
        return {
          renderRoot: () => (
            <Root>
              <Children />
            </Root>
          ),
          renderRoute: () => (
            <Slot id="layout:/">
              <Slot id="page:/nested/baz" />
            </Slot>
          ),
          renderers: {
            'layout:/': () => (
              <HomeLayout>
                <Children />
              </HomeLayout>
            ),
            'page:/nested/baz': () => <NestedBazPage />,
          },
        };
      }
      if (path.startsWith('/dynamic/')) {
        return {
          renderRoot: () => (
            <Root>
              <Children />
            </Root>
          ),
          renderRoute: () => (
            <Slot id="layout:/">
              <Slot id="page:/dynamic/[slug]" />
            </Slot>
          ),
          renderers: {
            'layout:/': () => (
              <HomeLayout>
                <Children />
              </HomeLayout>
            ),
            'page:/dynamic/[slug]': () => <h3>{path}</h3>,
          },
        };
      }
      throw new Error('renderRoute: No such path:' + path);
    },
    handleApi: async (req): Promise<Response> => {
      const path = new URL(req.url).pathname;
      if (path === '/api/hi.txt') {
        const hiTxt = await readFile('./private/hi.txt');
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(hiTxt);
              controller.close();
            },
          }),
        );
      } else if (path === '/api/hi') {
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('hello world!'));
              controller.close();
            },
          }),
        );
      } else if (path === '/api/empty') {
        return new Response(null, {
          status: 200,
        });
      } else {
        return new Response(null, {
          status: 404,
        });
      }
    },
  }),
);
