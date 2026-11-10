import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { InlineConfig, ViteDevServer } from 'vite';
import {
  createServer,
  isFileLoadingAllowed,
  normalizePath,
  resolveConfig,
} from 'vite';
import { afterAll, beforeAll, expect, test } from 'vitest';
import {
  VITE_DEFAULT_FS_DENY_FOR_TEST,
  privateDirPlugin,
} from '../src/lib/vite-plugins/private-dir.js';

const root = normalizePath(
  mkdtempSync(path.join(tmpdir(), 'waku (private) [dir]+')),
);
const inlineConfig = (overrides: InlineConfig = {}): InlineConfig => ({
  root,
  configFile: false,
  logLevel: 'silent',
  plugins: [privateDirPlugin({ privateDir: 'private' })],
  ...overrides,
});

let server: ViteDevServer;
let port: number;

const requestStatus = (rawPath: string) =>
  new Promise<number>((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: rawPath }, (res) => {
        res.resume();
        resolve(res.statusCode!);
      })
      .on('error', reject);
  });

beforeAll(async () => {
  for (const [file, content] of [
    ['private/hi.txt', 'hello'],
    ['private/nested/.secret.json', '{}'],
    ['src/hi.txt', 'public'],
    ['.env', 'KEY=value'],
  ] as const) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  server = await createServer(
    inlineConfig({
      server: { host: '127.0.0.1' },
      resolve: { alias: [{ find: '/shared', replacement: `${root}/private` }] },
    }),
  );
  await server.listen();
  port = (server.httpServer!.address() as AddressInfo).port;
});

afterAll(async () => {
  await server.close();
  rmSync(root, { recursive: true, force: true });
});

test('refuses files under privateDir however the request names them', async () => {
  for (const rawPath of [
    '/private/hi.txt',
    '/private/nested/.secret.json',
    '/private/hi.txt?raw',
    '/%70rivate/hi.txt',
    encodeURI(`/@fs${root}/private/hi.txt`),
    encodeURI(`/@fs/../abcd${root}/private/hi.txt`),
    '/shared/hi.txt',
  ]) {
    expect(await requestStatus(rawPath), rawPath).toBe(403);
  }
});

test('keeps serving other files and routes', async () => {
  expect(await requestStatus('/src/hi.txt')).toBe(200);
  expect(await requestStatus('/private/account')).toBe(404);
});

test("keeps Vite's default deny list", async () => {
  expect(await requestStatus('/.env')).toBe(403);
  const config = await resolveConfig(
    { root, configFile: false, logLevel: 'silent' },
    'serve',
  );
  expect(config.server.fs.deny).toEqual(VITE_DEFAULT_FS_DENY_FOR_TEST);
});

test("keeps the user's deny list", async () => {
  const config = await resolveConfig(
    inlineConfig({ server: { fs: { deny: ['*.secret'] } } }),
    'serve',
  );
  expect(config.server.fs.deny).toEqual(['*.secret', expect.any(String)]);
  expect(isFileLoadingAllowed(config, `${root}/private/hi.txt`)).toBe(false);
  expect(isFileLoadingAllowed(config, `${root}/Private/hi.txt`)).toBe(false);
  expect(isFileLoadingAllowed(config, `${root}/src/hi.txt`)).toBe(true);
});

test('denies a custom privateDir only', async () => {
  const config = await resolveConfig(
    inlineConfig({ plugins: [privateDirPlugin({ privateDir: 'secrets' })] }),
    'serve',
  );
  expect(isFileLoadingAllowed(config, `${root}/secrets/hi.txt`)).toBe(false);
  expect(isFileLoadingAllowed(config, `${root}/private/hi.txt`)).toBe(true);
  expect(isFileLoadingAllowed(config, `${root}/src/secrets/hi.txt`)).toBe(true);
});
