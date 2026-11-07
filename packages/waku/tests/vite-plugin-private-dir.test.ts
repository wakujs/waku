import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, ResolvedConfig, ViteDevServer } from 'vite';
import { expect, test } from 'vitest';
import { privateDirPlugin } from '../src/lib/vite-plugins/private-dir.js';

const root = '/app';

const createRequestStatus = async ({
  base = '/',
  privateDir = 'private',
} = {}) => {
  const plugin = privateDirPlugin({ privateDir });
  const { configResolved, configureServer } = plugin;
  if (
    typeof configResolved !== 'function' ||
    typeof configureServer !== 'function'
  ) {
    throw new Error('Plugin hooks are not defined');
  }
  const config = { root, base } as ResolvedConfig;
  let middleware: Connect.NextHandleFunction | undefined;
  await configResolved.call({} as never, config);
  await configureServer.call(
    {} as never,
    {
      config,
      middlewares: {
        use: (handler: Connect.NextHandleFunction) => {
          middleware = handler;
        },
      },
    } as unknown as ViteDevServer,
  );
  if (!middleware) {
    throw new Error('Middleware is not registered');
  }
  const handle = middleware;
  return (url: string): number | 'next' => {
    let status: number | 'next' = 'next';
    const res = {
      set statusCode(code: number) {
        status = code;
      },
      end: () => {},
    } as unknown as ServerResponse;
    handle({ url } as IncomingMessage, res, () => {});
    return status;
  };
};

test('rejects requests for files under privateDir', async () => {
  const requestStatus = await createRequestStatus();
  for (const url of [
    '/private/hi.txt',
    '/private/nested/hi.txt',
    '/private/',
    '/private',
    '/Private/hi.txt',
    '/%70rivate/hi.txt',
    '/private%2Fhi.txt',
    '/src/../private/hi.txt',
    '/private/hi.txt?import',
    '/private/hi.txt?raw#hash',
    `/@fs${root}/private/hi.txt`,
    `/@fs/${root}/private/hi.txt`,
  ]) {
    expect(requestStatus(url), url).toBe(403);
  }
});

test('passes requests for files outside privateDir', async () => {
  const requestStatus = await createRequestStatus();
  for (const url of [
    '/',
    '/index.html',
    '/src/pages/index.tsx',
    '/privateer/hi.txt',
    '/public/private/hi.txt',
    '/private/../src/hi.txt',
    `/@fs${root}/src/private-notes.txt`,
    `/@fs/other/private/hi.txt`,
  ]) {
    expect(requestStatus(url), url).toBe('next');
  }
});

test('rejects requests with and without the base path', async () => {
  const requestStatus = await createRequestStatus({ base: '/base/' });
  expect(requestStatus('/base/private/hi.txt')).toBe(403);
  expect(requestStatus('/private/hi.txt')).toBe(403);
  expect(requestStatus('/base/src/hi.txt')).toBe('next');
});

test('respects a custom privateDir', async () => {
  const requestStatus = await createRequestStatus({ privateDir: 'secrets' });
  expect(requestStatus('/secrets/hi.txt')).toBe(403);
  expect(requestStatus('/private/hi.txt')).toBe('next');
});
