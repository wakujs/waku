import type { ReactNode } from 'react';
import { readFile } from 'node:fs/promises';
// NOTE: I think we need one spec to use non-default adapter
import adapter from 'waku/adapters/node';
import { Children, Slot } from 'waku/minimal/client';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import { Slice001 } from './components/slice001.js';
import { Slice002 } from './components/slice002.js';
import Bar1Page from './routes/bar1/page.js';
import Bar2Page from './routes/bar2/page.js';
import Baz1Page from './routes/baz1/page.js';
import Baz2Page from './routes/baz2/page.js';
import FooPage from './routes/foo/page.js';
import Layout from './routes/layout.js';
import Page from './routes/page.js';

const STATIC_PATHS = ['/', '/foo', '/baz2'];
const STATIC_PAGES = ['/', '/foo', '/bar2', '/baz2'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar1': <Bar1Page />, // dynamic page + static slice
  '/bar2': <Bar2Page />, // static page + dynamic slice
  '/baz1': <Baz1Page />, // dynamic page + lazy static slice
  '/baz2': <Baz2Page />, // static page + lazy dynamic slice
};

const elementRenderers: Record<string, () => ReactNode> = {
  root: () => (
    <html>
      <head>
        <title>Waku example</title>
      </head>
      <body>
        <Children />
      </body>
    </html>
  ),
  'layout:/': () => (
    <Layout>
      <Children />
    </Layout>
  ),
};
for (const path of Object.keys(PATH_PAGE)) {
  elementRenderers[`route:${path}`] = () => (
    <Slot id="layout:/">
      <Slot id={`page:${path}`} />
    </Slot>
  );
  elementRenderers[`page:${path}`] = () => PATH_PAGE[path];
}

const sliceRenderers: Record<string, () => ReactNode> = {
  slice001: () => <Slice001 />,
  slice002: () => <Slice002 />,
};

const apiHandlers: Record<string, (req: Request) => Promise<Response>> = {
  hi: async (req) => {
    if (req.method === 'GET') {
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('hello world!'));
            controller.close();
          },
        }),
      );
    }
    if (req.method === 'POST') {
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
    }
    return new Response(null, { status: 404 });
  },
  'hi.txt': async () => {
    const hiTxt = await readFile('./private/hi.txt');
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(hiTxt);
          controller.close();
        },
      }),
    );
  },
  empty: async () => new Response(null, { status: 200 }),
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  renderElement: (id) => elementRenderers[id]!(),
  renderSlice: async (id) => sliceRenderers[id]!(),
  handleApi: async (id, req) => apiHandlers[id]!(req),
  getConfigs: async () => [
    ...Object.keys(PATH_PAGE).map((path) => {
      return {
        type: 'route' as const,
        path: path
          .split('/')
          .filter(Boolean)
          .map((name) => ({ type: 'literal', name }) as const),
        isStatic: STATIC_PATHS.includes(path),
        ...(path === '/' ? { slices: ['slice001'] } : {}),
        ...(path === '/bar1' ? { slices: ['slice001'] } : {}),
        ...(path === '/bar2' ? { slices: ['slice002'] } : {}),
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: `route:${path}` },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          [`page:${path}`]: {
            isStatic: STATIC_PAGES.includes(path),
            rendererId: `page:${path}`,
          },
        },
      };
    }),
    {
      type: 'api' as const,
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi' },
      ],
      isStatic: false,
      handlerId: 'hi',
    },
    {
      type: 'api' as const,
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi.txt' },
      ],
      isStatic: false,
      handlerId: 'hi.txt',
    },
    {
      type: 'api' as const,
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'empty' },
      ],
      isStatic: true,
      handlerId: 'empty',
    },
    {
      type: 'slice' as const,
      id: 'slice001',
      isStatic: true,
      rendererId: 'slice001',
    },
    {
      type: 'slice' as const,
      id: 'slice002',
      isStatic: false,
      rendererId: 'slice002',
    },
  ],
});

export default adapter(router);
