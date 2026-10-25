// @vitest-environment happy-dom

import { expect, test, vi } from 'vitest';
import type { Unstable_RscEnhancer } from '../src/minimal/client.js';
import { getRouterCacheForTest } from '../src/router/client-core-utils/caches.js';
import { createServerFunctionRouting } from '../src/router/client-core-utils/server-function-routing.js';
import {
  ACTION_LOCATION_HEADER,
  IS_ORIGIN_ID,
  IS_STATIC_ID,
  ROUTE_ID,
  getRouteSlotId,
} from '../src/router/isomorphic-utils/router-protocol.js';

vi.mock('react-server-dom-webpack/client', () => ({ default: {} }));

const createConnection = (path: string) => ({
  cache: getRouterCacheForTest(async () => ({})),
  getSettledRoute: () => ({ path, query: 'q=1', hash: '' }),
  getPendingRoute: () => undefined,
  onRouteChange: vi.fn(),
});

test('an installed controller passes RSC through and rejects actions before connection', async () => {
  const controller = createServerFunctionRouting();
  const next = vi.fn<ReturnType<Unstable_RscEnhancer>>(async () => ({
    elements: {},
  }));
  const request = controller.enhancer(next);
  const options = { type: 'rsc' as const, fetch: globalThis.fetch };
  await request('R/start', undefined, options);
  expect(next).toHaveBeenCalledExactlyOnceWith('R/start', undefined, options);
  await expect(
    request('F/action', [], { ...options, type: 'call' }),
  ).rejects.toThrow('Server function routing is not connected');
  expect(next).toHaveBeenCalledTimes(1);
});

test('in-flight actions use committed callbacks and an old cleanup cannot clear a new connection', async () => {
  const controller = createServerFunctionRouting();
  const first = createConnection('/first');
  const second = createConnection('/second');
  const disconnectFirst = controller.connect(first);
  let resolve!: (result: {
    elements: Record<string, unknown>;
    value: string;
  }) => void;
  const response = new Promise<{
    elements: Record<string, unknown>;
    value: string;
  }>((accept) => {
    resolve = accept;
  });
  const transport = vi.fn<typeof fetch>(async () => new Response());
  const request = controller.enhancer((nextPath, _params, options) => {
    return options.fetch(nextPath).then(() => response);
  });
  const result = request('F/action', [], { type: 'call', fetch: transport });
  const disconnectSecond = controller.connect(second);
  disconnectFirst();
  resolve({
    elements: { [ROUTE_ID]: ['/destination', ''], [IS_STATIC_ID]: true },
    value: 'value',
  });
  expect((await result).value).toBe('value');
  expect(
    new Headers(transport.mock.lastCall![1]?.headers).get(
      ACTION_LOCATION_HEADER,
    ),
  ).toBe('/first?q=1');
  expect(first.onRouteChange).not.toHaveBeenCalled();
  expect(second.onRouteChange).toHaveBeenCalledExactlyOnceWith({
    path: '/destination',
    query: '',
    hash: '',
  });
  expect(
    second.cache.canReuseStaticRoute(
      { path: '/destination', query: '', hash: '' },
      { [getRouteSlotId('/destination')]: 'destination' },
    ),
  ).toBe(true);
  disconnectSecond();
  await expect(
    request('F/action', [], { type: 'call', fetch: transport }),
  ).rejects.toThrow('Server function routing is not connected');
});

test('controllers own independent connections', async () => {
  const first = createServerFunctionRouting();
  const second = createServerFunctionRouting();
  const firstConnection = createConnection('/first');
  const secondConnection = createConnection('/second');
  const disconnectFirst = first.connect(firstConnection);
  second.connect(secondConnection);
  disconnectFirst();
  const result = { elements: { [ROUTE_ID]: ['/next', ''] }, value: 42 };
  expect(
    await second.enhancer(async () => result)('F/action', [], {
      type: 'call',
      fetch: globalThis.fetch,
    }),
  ).toBe(result);
  expect(firstConnection.onRouteChange).not.toHaveBeenCalled();
  expect(secondConnection.onRouteChange).toHaveBeenCalledOnce();
});

test('an in-flight action reconciles its origin rerender after disconnection', async () => {
  const controller = createServerFunctionRouting();
  const connection = createConnection('/origin');
  const disconnect = controller.connect(connection);
  let resolve!: () => void;
  const pending = new Promise<void>((accept) => {
    resolve = accept;
  });
  const elements = {
    [getRouteSlotId('/origin')]: 'updated',
    [ROUTE_ID]: ['/origin', 'q=1'],
    [IS_ORIGIN_ID]: true,
  };
  const response = controller.enhancer(async () => {
    await pending;
    return { elements, value: 'done' };
  })('F/action', [], { type: 'call', fetch: globalThis.fetch });
  disconnect();
  resolve();
  expect(await response).toEqual({
    elements: {
      [getRouteSlotId('/origin')]: 'updated',
      [ROUTE_ID]: ['/origin', 'q=1'],
    },
    value: 'done',
  });
  expect(connection.onRouteChange).not.toHaveBeenCalled();
});

test('an origin rerender is dropped after a newer connection disconnects', async () => {
  const controller = createServerFunctionRouting();
  const first = createConnection('/first');
  const second = createConnection('/second');
  controller.connect(first);
  let resolve!: () => void;
  const pending = new Promise<void>((accept) => {
    resolve = accept;
  });
  const response = controller.enhancer(async () => {
    await pending;
    return {
      elements: {
        [getRouteSlotId('/first')]: 'stale',
        [ROUTE_ID]: ['/first', 'q=1'],
        [IS_ORIGIN_ID]: true,
      },
      value: 'done',
    };
  })('F/action', [], { type: 'call', fetch: globalThis.fetch });
  const disconnectSecond = controller.connect(second);
  disconnectSecond();
  resolve();
  expect(await response).toEqual({ elements: {}, value: 'done' });
  expect(first.onRouteChange).not.toHaveBeenCalled();
  expect(second.onRouteChange).not.toHaveBeenCalled();
});

test('an in-flight route change uses the latest connection after cleanup', async () => {
  const controller = createServerFunctionRouting();
  const first = createConnection('/first');
  const second = createConnection('/second');
  controller.connect(first);
  let resolve!: () => void;
  const pending = new Promise<void>((accept) => {
    resolve = accept;
  });
  const result = {
    elements: { [ROUTE_ID]: ['/destination', ''], [IS_STATIC_ID]: true },
    value: 'done',
  };
  const response = controller.enhancer(async () => {
    await pending;
    return result;
  })('F/action', [], { type: 'call', fetch: globalThis.fetch });
  const disconnectSecond = controller.connect(second);
  disconnectSecond();
  resolve();
  expect(await response).toBe(result);
  expect(first.onRouteChange).not.toHaveBeenCalled();
  expect(second.onRouteChange).toHaveBeenCalledExactlyOnceWith({
    path: '/destination',
    query: '',
    hash: '',
  });
  expect(
    second.cache.canReuseStaticRoute(
      { path: '/destination', query: '', hash: '' },
      { [getRouteSlotId('/destination')]: 'destination' },
    ),
  ).toBe(true);
});
