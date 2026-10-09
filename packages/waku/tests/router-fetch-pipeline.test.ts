// @vitest-environment happy-dom

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { unstable_createCustomError as createCustomError } from '../src/minimal/server.js';
import {
  type Unstable_FetchRoute as FetchRoute,
  unstable_load as load,
} from '../src/router/client-core.js';

const start = { path: '/start', query: '', hash: '' };
const next = { ...start, path: '/next' };

const options = () => ({
  signal: new AbortController().signal,
  has404: false,
  settled: start,
  url: new URL('/next', window.location.href),
});

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

test('a bare fetch callback follows redirects without a Router cache', async () => {
  const elements = { root: 'opaque response' };
  const fetchRoute = vi
    .fn<FetchRoute>()
    .mockRejectedValueOnce(
      createCustomError('moved', { location: '/final?tab=1#section' }),
    )
    .mockResolvedValueOnce(elements);
  const opts = options();
  const result = await load(fetchRoute, next, opts);
  expect(result).toEqual({
    type: 'loaded',
    route: { path: '/final', query: 'tab=1', hash: '#section' },
    url: new URL('/final?tab=1#section', window.location.href),
    follows: 1,
    elements,
  });
  expect(fetchRoute).toHaveBeenCalledTimes(2);
  expect(fetchRoute).toHaveBeenLastCalledWith(
    {
      route: { path: '/final', query: 'tab=1', hash: '#section' },
      url: new URL('/final?tab=1#section', window.location.href),
      follows: 1,
    },
    opts.signal,
  );
});

test('a bare fetch callback follows a custom 404 while retaining the requested URL', async () => {
  const fetchRoute = vi
    .fn<FetchRoute>()
    .mockRejectedValueOnce(createCustomError('missing', { status: 404 }))
    .mockResolvedValueOnce({ root: 'not found' });
  const opts = {
    ...options(),
    has404: true,
    url: new URL('/missing?filter=1#section', window.location.href),
  };
  const result = await load(
    fetchRoute,
    { path: '/missing', query: 'filter=1', hash: '#section' },
    opts,
  );
  expect(result).toMatchObject({
    type: 'loaded',
    route: { path: '/404', query: 'filter=1', hash: '' },
    url: opts.url,
    follows: 1,
  });
  expect(fetchRoute).toHaveBeenCalledTimes(2);
});

test('a bare fetch callback resumes the shared render-time follow budget', async () => {
  const fetchRoute = vi
    .fn<FetchRoute>()
    .mockRejectedValue(createCustomError('moved', { location: '/final' }));
  const result = await load(fetchRoute, next, {
    ...options(),
    follows: 20,
  });
  expect(result).toMatchObject({
    type: 'failed',
    follows: 20,
    error: new Error('too many redirect or 404 follows'),
  });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
});

test('a bare fetch callback can reuse content without inventing a payload', async () => {
  const fetchRoute = vi.fn<FetchRoute>().mockResolvedValue(undefined);
  const result = await load(fetchRoute, next, options());
  expect(result).toEqual({
    type: 'reused',
    route: next,
    url: options().url,
    follows: 0,
  });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
});

test('a bare fetch callback reports an external redirect without following it', async () => {
  const error = createCustomError('leave', {
    location: 'https://example.com/outside',
  });
  const fetchRoute = vi.fn<FetchRoute>().mockRejectedValue(error);
  const opts = options();
  const result = await load(fetchRoute, next, opts);
  expect(result).toEqual({
    type: 'external',
    route: next,
    from: opts.url,
    url: new URL('https://example.com/outside'),
    error,
    follows: 0,
  });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
});

test('a bare fetch callback receives cancellation rather than a commit error', async () => {
  const controller = new AbortController();
  const fetchRoute = vi.fn<FetchRoute>().mockImplementation(
    (_attempt, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), {
          once: true,
        });
      }),
  );
  const pending = load(fetchRoute, next, {
    ...options(),
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).resolves.toEqual({ type: 'aborted' });
});

test('cancellation discards a fetch callback that resolves after ignoring its signal', async () => {
  const controller = new AbortController();
  let finish!: (elements: Record<string, unknown>) => void;
  const response = new Promise<Record<string, unknown>>((resolve) => {
    finish = resolve;
  });
  const fetchRoute = vi.fn<FetchRoute>().mockReturnValue(response);
  const pending = load(fetchRoute, next, {
    ...options(),
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).resolves.toEqual({ type: 'aborted' });
  finish({ root: 'late response' });
  await response;
  await expect(pending).resolves.toEqual({ type: 'aborted' });
  expect(fetchRoute).toHaveBeenCalledTimes(1);
});

test('a fetch callback can reject after synchronously cancelling the load', async () => {
  const controller = new AbortController();
  const fetchRoute = vi.fn<FetchRoute>().mockImplementation(() => {
    controller.abort();
    return Promise.reject(new Error('request cancelled'));
  });
  const pending = load(fetchRoute, next, {
    ...options(),
    signal: controller.signal,
  });
  await expect(pending).resolves.toEqual({ type: 'aborted' });
});
