// @vitest-environment happy-dom

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  type Unstable_FetchRoute as FetchRoute,
  unstable_load as load,
} from '../src/router/client-core.js';

const start = { path: '/start', query: '', hash: '' };
const next = { ...start, path: '/next' };

const options = () => ({
  signal: new AbortController().signal,
  has404: false,
  url: new URL('/next', window.location.href),
});

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
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

test('an HTTP 404 on a static host follows the custom page with the requested URL', async () => {
  const failure = new Error('Not Found', {
    cause: new Response('Not Found', { status: 404 }),
  });
  const elements = { root: 'custom not found' };
  const fetchRoute = vi
    .fn<FetchRoute>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValueOnce(elements);
  const opts = {
    ...options(),
    has404: true,
    url: new URL('/missing?q=1#frag', window.location.href),
  };
  const result = await load(
    fetchRoute,
    { path: '/missing', query: 'q=1', hash: '#frag' },
    opts,
  );
  expect(result).toEqual({
    type: 'loaded',
    route: { path: '/404', query: 'q=1', hash: '' },
    url: opts.url,
    follows: 1,
    elements,
  });
  expect(fetchRoute).toHaveBeenCalledTimes(2);
});

test('an HTTP 404 shares the preceding intent follow budget', async () => {
  const failure = new Error('Not Found', {
    cause: new Response(null, { status: 404 }),
  });
  const fetchRoute = vi.fn<FetchRoute>().mockRejectedValue(failure);
  const result = await load(fetchRoute, next, {
    ...options(),
    has404: true,
    follows: 20,
  });
  expect(result).toMatchObject({
    type: 'failed',
    error: new Error('too many redirect or 404 follows'),
    follows: 20,
  });
  expect(fetchRoute).toHaveBeenCalledOnce();
});

test('an HTTP failure without a custom page retains its original error', async () => {
  const failure = new Error('Not Found', {
    cause: new Response(null, { status: 404 }),
  });
  const fetchRoute = vi.fn<FetchRoute>().mockRejectedValue(failure);
  const result = await load(fetchRoute, next, options());
  expect(result).toMatchObject({ type: 'failed', error: failure });
  expect(fetchRoute).toHaveBeenCalledOnce();
});
