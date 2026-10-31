import process from 'node:process';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWeakPromise } from '../../../src/lib/utils-server/weak-promise.ts';

const require = createRequire(import.meta.url);
const React = require('react');
const server = require('react-server-dom-webpack/server.edge');
const weak = createWeakPromise();
const gate = Promise.withResolvers();
process.on('message', (message) => {
  if (message === 'continue') gate.resolve();
});
async function Page() {
  await gate.promise;
  if (process.env.WAKU_WEAK_SSR_CASE === 'redirect')
    weak.resolve(JSON.stringify({ status: 307, location: '/late-target' }));
  if (process.env.WAKU_WEAK_SSR_CASE === 'not-found')
    weak.resolve(JSON.stringify({ status: 404 }));
  return React.createElement('p', null, 'page complete');
}
const stream = server.renderToReadableStream(
  { INTENT: weak.promise, page: React.createElement(Page) },
  {},
  { onError: () => 'ssr-probe-error' },
);
await pipeline(Readable.fromWeb(stream), process.stdout);
process.disconnect();
