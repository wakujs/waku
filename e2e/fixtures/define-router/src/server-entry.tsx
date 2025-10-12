import { readFile } from 'node:fs/promises';
import { nodeAdapter } from 'waku/adapters/node';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import Bar1Page from './routes/bar1/page.js';
import Bar2Page from './routes/bar2/page.js';
import Baz1Page from './routes/baz1/page.js';
import Baz2Page from './routes/baz2/page.js';
import FooPage from './routes/foo/page.js';
import Layout from './routes/layout.js';
import Page from './routes/page.js';

const STATIC_PATHS = ['/', '/foo', '/baz2'];
const STATIC_PAGES = ['/', '/foo', '/bar2', '/baz2'];
const PATH_PAGE: Record<string, unknown> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar1': <Bar1Page />, // dynamic page + static slice
  '/bar2': <Bar2Page />, // static page + dynamic slice
  '/baz1': <Baz1Page />, // dynamic page + lazy static slice
  '/baz2': <Baz2Page />, // static page + lazy dynamic slice
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  getConfig: async () => [
    ...Object.keys(PATH_PAGE).map((path) => {
      return {
        type: 'route' as const,
        pattern: `^${path}$`,
        path: path
          .split('/')
          .filter(Boolean)
          .map((name) => ({ type: 'literal', name }) as const),
        isStatic: STATIC_PATHS.includes(path),
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          [`page:${path}`]: { isStatic: STATIC_PAGES.includes(path) },
        },
      };
    }),
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
      isStatic: false,
    },
    {
      type: 'api',
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'empty' },
      ],
      isStatic: true,
    },
    {
      type: 'slice',
      id: 'slice001',
      isStatic: true,
    },
    {
      type: 'slice',
      id: 'slice002',
      isStatic: false,
    },
  ],
  handleRoute: async (path) => {
    if (!(path in PATH_PAGE)) {
      throw new Error('renderRoute: No such path:' + path);
    }
    return {
      rootElement: (
        <html>
          <head>
            <title>Waku example</title>
          </head>
          <body>
            <Children />
          </body>
        </html>
      ),
      routeElement: (
        <Slot id="layout:/">
          <Slot id={`page:${path}`} />
        </Slot>
      ),
      elements: {
        'layout:/': (
          <Layout>
            <Children />
          </Layout>
        ),
        [`page:${path}`]: PATH_PAGE[path],
      },
      ...(path === '/' ? { slices: ['slice001'] } : {}),
      ...(path === '/bar1' ? { slices: ['slice001'] } : {}),
      ...(path === '/bar2' ? { slices: ['slice002'] } : {}),
    };
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
    } else if (path === '/api/hi' && req.method === 'GET') {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('hello world!'));
            controller.close();
          },
        }),
      );
    } else if (path === '/api/hi' && req.method === 'POST') {
      const bodyContent = await new Response(req.body).text();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`POST to hello world! ${bodyContent}`),
            );
            controller.close();
          },
        }),
      );
    } else if (path === '/api/empty') {
      return new Response(null, {
        status: 200,
      });
    }
    return new Response(null, {
      status: 404,
    });
  },
  handleSlice: async (sliceId) => {
    if (sliceId === 'slice001') {
      return { element: <Slice001 /> };
    }
    if (sliceId === 'slice002') {
      return { element: <Slice002 /> };
    }
    throw new Error('No such slice: ' + sliceId);
  },
});

export default nodeAdapter(router);
