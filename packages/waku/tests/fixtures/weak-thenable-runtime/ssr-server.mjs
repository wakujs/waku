import process from 'node:process';
import { createRequire, registerHooks } from 'node:module';
import { URL, fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js'))
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      throw error;
    }
  },
});
const require = createRequire(import.meta.url);
const React = require('react');
const server = require('react-server-dom-webpack/server.edge');
const native = require('./package.json').dependencies.react.startsWith(
  '0.0.0-experimental-',
);
const sourceRoot = fileURLToPath(new URL('../../../src/', import.meta.url));
const { unstable_createWeakPromise: createWeakPromise } = await import(
  sourceRoot + 'minimal/server.ts'
);
const { renderWithWeakPromises } = native
  ? { renderWithWeakPromises: (data, render) => render(data) }
  : await import(sourceRoot + 'lib/utils-server/weak-promise-stream.ts');
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
const stream = renderWithWeakPromises(
  { INTENT: weak.promise, page: React.createElement(Page) },
  (data) =>
    server.renderToReadableStream(
      data,
      {},
      { onError: () => 'ssr-probe-error' },
    ),
);
await pipeline(Readable.fromWeb(stream), process.stdout);
process.disconnect();
