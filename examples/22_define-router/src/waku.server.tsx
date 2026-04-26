import type { ReactNode } from 'react';
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

const elementRenderers: Record<
  string,
  (option: { routePath: string }) => ReactNode
> = {
  root: () => (
    <Root>
      <Children />
    </Root>
  ),
  'layout:/': () => (
    <HomeLayout>
      <Children />
    </HomeLayout>
  ),
  'route:/': () => (
    <Slot id="layout:/">
      <Slot id="page:/" />
    </Slot>
  ),
  'route:/foo': () => (
    <Slot id="layout:/">
      <Slot id="page:/foo" />
    </Slot>
  ),
  'route:/bar': () => (
    <Slot id="layout:/">
      <Slot id="page:/bar" />
    </Slot>
  ),
  'route:/nested/baz': () => (
    <Slot id="layout:/">
      <Slot id="page:/nested/baz" />
    </Slot>
  ),
  'route:/dynamic/[slug]': () => (
    <Slot id="layout:/">
      <Slot id="page:/dynamic/[slug]" />
    </Slot>
  ),
  'page:/': () => <HomePage />,
  'page:/foo': () => <FooPage />,
  'page:/bar': () => <BarPage />,
  'page:/nested/baz': () => <NestedBazPage />,
  'page:/dynamic/[slug]': ({ routePath }) => <h3>{routePath}</h3>,
};

const apiHandlers: Record<string, () => Promise<Response>> = {
  hi: async () =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('hello world!'));
          controller.close();
        },
      }),
    ),
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

export default adapter(
  defineRouter({
    renderElement: (id, option) => elementRenderers[id]!(option),
    renderSlice: async () => {
      throw new Error('No slices defined');
    },
    handleApi: async (id) => apiHandlers[id]!(),
    getConfigs: async () => [
      {
        type: 'route',
        path: [],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: 'route:/' },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          'page:/': { isStatic: true, rendererId: 'page:/' },
        },
      },
      {
        type: 'route',
        path: [{ type: 'literal', name: 'foo' }],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: 'route:/foo' },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          'page:/foo': { isStatic: true, rendererId: 'page:/foo' },
        },
      },
      {
        type: 'route',
        path: [{ type: 'literal', name: 'bar' }],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: 'route:/bar' },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          'page:/bar': { isStatic: true, rendererId: 'page:/bar' },
        },
      },
      {
        type: 'route',
        path: [
          { type: 'literal', name: 'nested' },
          { type: 'literal', name: 'baz' },
        ],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: 'route:/nested/baz' },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          'page:/nested/baz': {
            isStatic: true,
            rendererId: 'page:/nested/baz',
          },
        },
      },
      {
        type: 'route',
        path: [
          { type: 'literal', name: 'dynamic' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, rendererId: 'root' },
        routeElement: { isStatic: true, rendererId: 'route:/dynamic/[slug]' },
        elements: {
          'layout:/': { isStatic: true, rendererId: 'layout:/' },
          // using `[slug]` syntax is just an example and it technically conflicts with others. So, it's better to use a different prefix like `dynamic-page:`.
          'page:/dynamic/[slug]': {
            isStatic: false,
            rendererId: 'page:/dynamic/[slug]',
          },
        },
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'hi' },
        ],
        isStatic: false,
        handlerId: 'hi',
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'hi.txt' },
        ],
        isStatic: true,
        handlerId: 'hi.txt',
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'empty' },
        ],
        isStatic: false,
        handlerId: 'empty',
      },
    ],
  }),
);
