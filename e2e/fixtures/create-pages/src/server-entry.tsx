import { createPages } from 'waku/router/server';
import type { PathsForPages } from 'waku/router';

import FooPage from './components/FooPage.js';
import HomeLayout from './components/HomeLayout.js';
import DynamicLayout from './components/DynamicLayout.js';
import HomePage from './components/HomePage.js';
import NestedBazPage from './components/NestedBazPage.js';
import NestedLayout from './components/NestedLayout.js';
import { DeeplyNestedLayout } from './components/DeeplyNestedLayout.js';
import ErrorPage from './components/ErrorPage.js';
import {
  SlowComponent,
  StaticLongSuspenseLayout,
  LongSuspenseLayout,
} from './components/LongSuspenseLayout.js';
import { readFile } from 'node:fs/promises';
import NoSsr from './components/NoSsr.js';
import { Slice001 } from './components/slice001.js';
import { Slice002 } from './components/slice002.js';
import { Slice003 } from './components/slice003.js';
import { Slice } from 'waku';

const pages: ReturnType<typeof createPages> = createPages(
  async ({ createPage, createLayout, createApi, createSlice }) => [
    createLayout({
      render: 'static',
      path: '/',
      component: HomeLayout,
    }),

    createPage({
      render: 'static',
      path: '/',
      component: HomePage,
    }),

    createPage({
      render: 'static',
      path: '/foo',
      component: FooPage,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/baz',
      component: NestedBazPage,
    }),

    createLayout({
      render: 'static',
      path: '/nested',
      component: NestedLayout,
    }),

    createPage({
      render: 'static',
      path: '/nested/[id]',
      staticPaths: ['foo', 'bar'],
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Static: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/wild/[...id]',
      component: ({ id }) => (
        <>
          <h2>Wildcard</h2>
          <h3>Slug: {id.join('/')}</h3>
        </>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/nested/[id]',
      component: DeeplyNestedLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/[id]',
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Dynamic: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/error',
      component: ErrorPage,
    }),

    createLayout({
      render: 'static',
      path: '/long-suspense',
      component: LongSuspenseLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/1',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 1</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/2',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 2</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/3',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 3</h3>
        </SlowComponent>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/static-long-suspense',
      component: StaticLongSuspenseLayout,
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/4',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 4</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/5',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 5</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/6',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 6</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/any/[...all]',
      component: ({ all }) => <h2>Catch-all: {all.join('/')}</h2>,
    }),

    // Custom Not Found page
    createPage({
      render: 'static',
      path: '/404',
      component: () => <h2>Not Found</h2>,
    }),

    createApi({
      path: '/api/hi.txt',
      render: 'static',
      method: 'GET',
      handler: async () => {
        const hiTxt = await readFile('./private/hi.txt', 'utf-8');
        return new Response(hiTxt);
      },
    }),

    createApi({
      path: '/api/hi',
      render: 'dynamic',
      handlers: {
        GET: async () => {
          return new Response('hello world!');
        },
        POST: async (req) => {
          const body = await req.text();
          return new Response(`POST to hello world! ${body}`);
        },
      },
    }),

    createApi({
      path: '/api/url',
      render: 'dynamic',
      handlers: {
        GET: async (req) => {
          return new Response('url ' + req.url);
        },
      },
    }),

    createApi({
      path: '/api/empty',
      render: 'static',
      method: 'GET',
      handler: async () => {
        return new Response(null);
      },
    }),

    createPage({
      render: 'static',
      path: '/exact/[slug]/[...wild]',
      exactPath: true,
      component: () => <h1>EXACTLY!!</h1>,
    }),

    createPage({
      render: 'static',
      path: '/(group)/test',
      component: () => <h1>Group Page</h1>,
    }),

    // Should not show for /(group)/test
    createLayout({
      render: 'static',
      path: '/test',
      component: ({ children }) => (
        <div>
          <h2>/test Layout</h2>
          {children}
        </div>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/(group)',
      component: ({ children }) => (
        <div>
          <h2>/(group) Layout</h2>
          {children}
        </div>
      ),
    }),

    createLayout({
      render: 'dynamic',
      path: '/dynamic',
      component: DynamicLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/dynamic',
      component: () => <h1>Dynamic Page</h1>,
    }),

    createLayout({
      render: 'dynamic',
      path: '/(dynamic)',
      component: ({ children }) => (
        <div>
          <h2>Dynamic Layout {new Date().toISOString()}</h2>
          {children}
        </div>
      ),
    }),
    createLayout({
      render: 'static',
      path: '/(dynamic)/(static)',
      component: ({ children }) => (
        <div>
          <h2>Static Layout {new Date().toISOString()}</h2>
          {children}
        </div>
      ),
    }),
    createPage({
      render: 'static',
      path: '/(dynamic)/(static)/nested-layouts',
      component: () => <h1>Nested Layouts page</h1>,
    }),

    createPage({
      render: 'static',
      path: '/no-ssr',
      component: NoSsr,
      unstable_disableSSR: true,
    }),

    createPage({
      render: 'dynamic',
      path: '/slices',
      slices: ['slice001', 'slice002'],
      component: () => (
        <>
          <h2>Slices</h2>
          <Slice id="slice001" />
          <Slice id="slice002" />
          <Slice
            id="slice003"
            lazy
            fallback={<p data-testid="slice003-loading">Loading...</p>}
          />
        </>
      ),
    }),

    createSlice({
      render: 'static',
      component: Slice001,
      id: 'slice001',
    }),

    createSlice({
      render: 'dynamic',
      component: Slice002,
      id: 'slice002',
    }),

    createSlice({
      render: 'dynamic',
      component: Slice003,
      id: 'slice003',
    }),
  ],
);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
  interface CreatePagesConfig {
    pages: typeof pages;
  }
}

export default pages;
