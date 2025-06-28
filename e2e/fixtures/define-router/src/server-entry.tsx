import { readFile } from 'node:fs/promises';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Layout from './routes/layout.js';
import Page from './routes/page.js';
import FooPage from './routes/foo/page.js';
import BarPage from './routes/bar/page.js';
import { Slice001 } from './components/slice001.js';

const STATIC_PATHS = ['/', '/foo'];
const PATH_PAGE: Record<string, unknown> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar': <BarPage />,
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  getConfig: async () => [
    ...Object.keys(PATH_PAGE).map((path) => {
      const isStatic = STATIC_PATHS.includes(path);
      return {
        type: 'route' as const,
        pattern: `^${path}$`,
        path: path
          .split('/')
          .filter(Boolean)
          .map((name) => ({ type: 'literal', name }) as const),
        rootElement: { isStatic },
        routeElement: { isStatic },
        elements: {
          'layout:/': { isStatic },
          [`page:${path}`]: { isStatic },
        },
        ...(['/', '/bar'].includes(path)
          ? { slices: { slice001: { isStatic: true } } }
          : {}),
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
      ...(['/', '/bar'].includes(path)
        ? { slices: { slice001: <Slice001 /> } }
        : {}),
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
