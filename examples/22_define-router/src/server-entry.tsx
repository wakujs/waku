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

const renderRoot = () => (
  <Root>
    <Children />
  </Root>
);

const renderHomeLayout = () => (
  <HomeLayout>
    <Children />
  </HomeLayout>
);

export default adapter(
  defineRouter({
    getConfigs: async () => [
      {
        type: 'route',
        pattern: '/',
        path: [],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, renderer: renderRoot },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id="page:/" />
            </Slot>
          ),
        },
        elements: {
          'layout:/': { isStatic: true, renderer: renderHomeLayout },
          'page:/': { isStatic: true, renderer: () => <HomePage /> },
        },
      },
      {
        type: 'route',
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, renderer: renderRoot },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id="page:/foo" />
            </Slot>
          ),
        },
        elements: {
          'layout:/': { isStatic: true, renderer: renderHomeLayout },
          'page:/foo': { isStatic: true, renderer: () => <FooPage /> },
        },
      },
      {
        type: 'route',
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        isStatic: true,
        slices: [],
        rootElement: { isStatic: true, renderer: renderRoot },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id="page:/bar" />
            </Slot>
          ),
        },
        elements: {
          'layout:/': { isStatic: true, renderer: renderHomeLayout },
          'page:/bar': { isStatic: true, renderer: () => <BarPage /> },
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
        slices: [],
        rootElement: { isStatic: true, renderer: renderRoot },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id="page:/nested/baz" />
            </Slot>
          ),
        },
        elements: {
          'layout:/': { isStatic: true, renderer: renderHomeLayout },
          'page:/nested/baz': {
            isStatic: true,
            renderer: () => <NestedBazPage />,
          },
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
        slices: [],
        rootElement: { isStatic: true, renderer: renderRoot },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id="page:/dynamic/[slug]" />
            </Slot>
          ),
        },
        elements: {
          'layout:/': { isStatic: true, renderer: renderHomeLayout },
          // using `[slug]` syntax is just an example and it technically conflicts with others. So, it's better to use a different prefix like `dynamic-page:`.
          'page:/dynamic/[slug]': {
            isStatic: false,
            renderer: ({ pathname }) => <h3>{pathname}</h3>,
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
        handler: async () => {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('hello world!'));
                controller.close();
              },
            }),
          );
        },
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'hi.txt' },
        ],
        isStatic: true,
        handler: async () => {
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
      },
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'api' },
          { type: 'literal', name: 'empty' },
        ],
        isStatic: false,
        handler: async () => {
          return new Response(null, {
            status: 200,
          });
        },
      },
    ],
  }),
);
