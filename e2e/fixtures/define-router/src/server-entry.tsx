import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Layout from './routes/layout.js';
import Page from './routes/page.js';
import FooPage from './routes/foo/page.js';
import { readFile } from 'node:fs/promises';

const STATIC_PATHS = ['/', '/foo'];
const PATH_PAGE: Record<string, unknown> = {
  '/': <Page />,
  '/foo': <FooPage />,
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  getConfig: async () => [
    ...STATIC_PATHS.map((path) => ({
      type: 'route' as const,
      pattern: `^${path}$`,
      path: path
        .split('/')
        .filter(Boolean)
        .map((name) => ({ type: 'literal', name }) as const),
      rootElement: { isStatic: true },
      routeElement: { isStatic: true },
      elements: {
        'layout:/': { isStatic: true },
        [`page:${path}`]: { isStatic: true },
      },
    })),
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
  ],
  handleRoute: async (path) => {
    if (!STATIC_PATHS.includes(path)) {
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
    };
  },
  handleApi: async (path, opt) => {
    if (path === '/api/hi.txt') {
      const hiTxt = await readFile('./private/hi.txt');

      return {
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(hiTxt);
            controller.close();
          },
        }),
      };
    } else if (path === '/api/hi' && opt.method === 'GET') {
      return {
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('hello world!'));
            controller.close();
          },
        }),
      };
    } else if (path === '/api/hi' && opt.method === 'POST') {
      const bodyContent = await new Response(opt.body).text();
      return {
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(`POST to hello world! ${bodyContent}`),
            );
            controller.close();
          },
        }),
      };
    } else if (path === '/api/empty') {
      return {
        status: 200,
      };
    }
    return {
      status: 404,
    };
  },
});

export default router;
