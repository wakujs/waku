/* global globalThis */
import { clearTimeout, setImmediate, setTimeout } from 'node:timers';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { URL, fileURLToPath } from 'node:url';

const { AbortController, ReadableStream, TextDecoder, console } = globalThis;

const require = createRequire(import.meta.url);
const React = require('react');
const client = require('react-server-dom-webpack/client.edge');
const dom = require('react-dom/server.edge');
const version = require('./package.json').dependencies.react;
const native = version.startsWith('0.0.0-experimental-');
const options = {
  serverConsumerManifest: {
    moduleMap: {},
    serverModuleMap: {},
    moduleLoading: null,
  },
};
const results = [];
const tick = () => new Promise((resolve) => setImmediate(resolve));

async function scenario(kind, observeCompletion) {
  const name =
    kind +
    (observeCompletion ? ' with EOF observation' : ' with direct promise use');
  const child = spawn(
    process.execPath,
    [
      '--conditions=react-server',
      '--experimental-strip-types',
      fileURLToPath(new URL('./ssr-server.mjs', import.meta.url)),
    ],
    {
      env: { ...process.env, WAKU_WEAK_SSR_CASE: kind },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) =>
      code === 0
        ? resolve()
        : reject(new Error(`RSC child failed: ${code ?? signal}: ${stderr}`)),
    );
  });
  void exited.catch(() => {});
  const abort = new AbortController();
  let timer;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('SSR timeout: ' + stderr)),
          2500,
        );
      }),
    ]);
    results.push({ name, result: 'pass' });
  } catch (error) {
    results.push({ name, result: 'fail', error: error.stack ?? String(error) });
  } finally {
    clearTimeout(timer);
    abort.abort();
    if (child.exitCode === null) child.kill();
  }

  async function run() {
    const done = Promise.withResolvers();
    const reader = Readable.toWeb(child.stdout).getReader();
    const flight = new ReadableStream(
      {
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              controller.close();
              done.resolve();
            } else controller.enqueue(part.value);
          } catch (error) {
            controller.error(error);
            done.reject(error);
          }
        },
        cancel: (reason) => reader.cancel(reason),
      },
      { highWaterMark: 0 },
    );
    const root = Promise.resolve(
      client.createFromReadableStream(flight, options),
    );
    const intent = root.then((model) =>
      observeCompletion
        ? Promise.race([model.INTENT, done.promise.then(() => undefined)])
        : model.INTENT,
    );
    function Intent() {
      const value = React.use(intent);
      if (value === undefined) return null;
      const data = JSON.parse(value);
      return data.status === 404
        ? React.createElement('h1', null, 'Not Found')
        : React.createElement('meta', {
            httpEquiv: 'refresh',
            content: '0;url=' + data.location,
          });
    }
    function Page() {
      return React.use(root).page;
    }
    const tree = React.createElement(
      'html',
      null,
      React.createElement(
        'body',
        null,
        React.createElement('p', null, 'shell ready'),
        React.createElement(
          React.Suspense,
          { fallback: null },
          React.createElement(Intent),
        ),
        React.createElement(
          React.Suspense,
          { fallback: 'loading page' },
          React.createElement(Page),
        ),
      ),
    );
    const html = await dom.renderToReadableStream(tree, {
      signal: abort.signal,
      onError: () => 'html-probe-error',
    });
    const htmlReader = html.getReader();
    const first = await htmlReader.read();
    assert.equal(first.done, false);
    let text = new TextDecoder().decode(first.value);
    assert.ok(text.includes('shell ready'));
    child.send('continue');
    await done.promise;
    await exited;
    if (kind === 'unused' && !observeCompletion && native) {
      let completed = false;
      void html.allReady.then(() => {
        completed = true;
      });
      await tick();
      assert.equal(completed, false);
      abort.abort(new Error('clean up expected suspended HTML'));
    }
    while (true) {
      const part = await htmlReader.read();
      if (part.done) break;
      text += new TextDecoder().decode(part.value);
    }
    await html.allReady;
    if (kind === 'redirect') {
      assert.ok(text.includes('http-equiv="refresh"'));
      assert.ok(text.includes('0;url=/late-target'));
    } else if (kind === 'not-found')
      assert.ok(text.includes('<h1>Not Found</h1>'));
    else if (observeCompletion || !native)
      assert.ok(!text.includes('http-equiv="refresh"'));
  }
}

for (const kind of ['unused', 'redirect', 'not-found'])
  await scenario(kind, true);
await scenario('unused', false);
console.log(
  JSON.stringify(
    {
      version,
      mode: native ? 'native' : 'filter',
      nodeEnv: process.env.NODE_ENV,
      results,
    },
    null,
    2,
  ),
);
process.exitCode = results.some((item) => item.result === 'fail') ? 1 : 0;
