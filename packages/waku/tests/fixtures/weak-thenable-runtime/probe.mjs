/* global globalThis */
import { Buffer } from 'node:buffer';
import { clearTimeout, setImmediate, setTimeout } from 'node:timers';
import process from 'node:process';
import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';

const {
  AbortController,
  AbortSignal,
  ReadableStream,
  Request,
  Response,
  TextDecoder,
  TextEncoder,
  TransformStream,
  console,
} = globalThis;

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      }
      throw error;
    }
  },
});
const require = createRequire(import.meta.url);
const expectedVersion = require('react/package.json').version;
const mode = expectedVersion.startsWith('0.0.0-experimental-')
  ? 'native'
  : 'filter';
const artifact = process.env.WAKU_WEAK_ARTIFACT;
const sourceRoot = fileURLToPath(new URL('../../../src/', import.meta.url));
const React = require('react');
const vendor = dirname(
  require.resolve('react-server-dom-webpack/package.json'),
);
const server = require(join(vendor, 'server.edge.js'));
const client = require(join(vendor, 'client.edge.js'));
const { createWeakPromise } = await import(
  sourceRoot + 'lib/utils-server/weak-promise.ts'
);
const { renderWithWeakPromises } =
  mode === 'native'
    ? { renderWithWeakPromises: (data, render) => render(data) }
    : await import(sourceRoot + 'lib/utils-server/weak-promise-stream.ts');
const versions = Object.fromEntries(
  ['react', 'react-dom', 'react-server-dom-webpack'].map((name) => [
    name,
    require(name + '/package.json').version,
  ]),
);
for (const version of Object.values(versions))
  assert.equal(version, expectedVersion);
const options = {
  serverConsumerManifest: {
    moduleMap: {},
    serverModuleMap: {},
    moduleLoading: null,
  },
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
async function state(promise) {
  let value = 'pending';
  Promise.resolve(promise).then(
    () => {
      value = 'fulfilled';
    },
    () => {
      value = 'rejected';
    },
  );
  await tick();
  return value;
}
async function unused(promise) {
  if (mode === 'native') {
    assert.equal(await state(promise), 'pending');
  } else {
    assert.equal(await promise, undefined);
    assert.equal(await state(promise), 'fulfilled');
  }
}
function run(
  data,
  { signal, fragment = 0, networkFragment = 0, disconnect } = {},
) {
  const nativeChunks = [];
  let encodes = 0;
  let decodes = 0;
  const onError = () => 'native-probe-error';
  const wire = renderWithWeakPromises({ ...data }, (model) => {
    encodes++;
    const source = server.renderToReadableStream(
      model,
      {},
      { signal, onError },
    );
    return source.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          nativeChunks.push(Buffer.from(chunk));
          if (fragment) {
            for (let i = 0; i < chunk.length; i += fragment)
              controller.enqueue(chunk.slice(i, i + fragment));
          } else controller.enqueue(chunk);
        },
      }),
      disconnect ? { signal: disconnect.signal } : undefined,
    );
  });
  const [decodeStream, byteStream] = wire.tee();
  const forClient = networkFragment
    ? decodeStream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            for (let i = 0; i < chunk.length; i += networkFragment)
              controller.enqueue(chunk.slice(i, i + networkFragment));
          },
        }),
      )
    : decodeStream;
  const nativeDecode = (stream) => {
    decodes++;
    return client.createFromReadableStream(stream, options);
  };
  // React decodes the response directly, with no Waku client normalizer.
  const root = Promise.resolve(nativeDecode(forClient));
  const bytes = new Response(byteStream).arrayBuffer().then((bytes) => {
    if (mode === 'native')
      assert.deepEqual(Buffer.from(bytes), Buffer.concat(nativeChunks));
    return Buffer.from(bytes);
  });
  void root.catch(() => {});
  void bytes.catch(() => {});
  return {
    root,
    bytes,
    nativeChunks,
    async assertSinglePass() {
      assert.equal(encodes, 1);
      assert.equal(decodes, 1);
    },
  };
}
const results = [];
async function scenario(name, fn) {
  if (
    process.env.WAKU_PROBE_CASE &&
    !name.includes(process.env.WAKU_PROBE_CASE)
  )
    return;
  const abort = new AbortController();
  let timer;
  try {
    await Promise.race([
      fn(abort.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          abort.abort(new Error('timeout'));
          reject(new Error('timeout'));
        }, 1600);
      }),
    ]);
    results.push({ name, result: 'pass' });
  } catch (error) {
    results.push({ name, result: 'fail', error: error.stack ?? String(error) });
  } finally {
    clearTimeout(timer);
  }
}

await scenario(
  'unused result ends at ordinary completion; raw payload remains inspectable',
  async (signal) => {
    const weak = createWeakPromise();
    const output = run(
      { channel: weak.promise, ordinary: Promise.resolve('done') },
      { signal },
    );
    const root = await output.root;
    const bytes = await output.bytes;
    await output.assertSinglePass();
    await unused(root.channel);
    assert.equal(await root.ordinary, 'done');
    weak.resolve('too late');
    await unused(root.channel);
    if (mode === 'native' || mode === 'filter') {
      assert.ok(!Object.hasOwn(root, '_weak'));
      assert.ok(!bytes.includes('waku-weak-'));
      assert.ok(!bytes.includes('"_weak"'));
      assert.ok(bytes.includes(mode === 'native' ? '"$w' : '"$undefined"'));
    }
    if (artifact)
      writeFileSync(
        join(artifact, `sample-${mode}-${process.env.NODE_ENV}.bin`),
        bytes,
      );
  },
);

await scenario(
  'late nested async components and React.use preserve intent',
  async (signal) => {
    const weak = createWeakPromise();
    const outer = Promise.withResolvers();
    const inner = Promise.withResolvers();
    let calls = 0;
    function Child() {
      React.use(inner.promise);
      weak.resolve('/late');
      calls++;
      return React.createElement('p', null, 'done');
    }
    async function Parent() {
      await outer.promise;
      return React.createElement(Child);
    }
    const output = run(
      { channel: weak.promise, page: React.createElement(Parent) },
      { signal },
    );
    const root = await output.root;
    outer.resolve();
    await tick();
    assert.equal(await state(root.channel), 'pending');
    inner.resolve();
    assert.equal(await root.channel, '/late');
    await output.bytes;
    assert.equal(calls, 1);
  },
);

await scenario(
  'early intent arrives while unrelated ordinary work is still pending',
  async (signal) => {
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const output = run(
      { channel: weak.promise, ordinary: gate.promise },
      { signal },
    );
    const root = await output.root;
    weak.resolve('/early');
    assert.equal(await root.channel, '/early');
    assert.equal(await state(root.ordinary), 'pending');
    gate.resolve('done');
    await output.bytes;
  },
);

await scenario(
  'promise revealing another pending promise stays strong',
  async (signal) => {
    const weak = createWeakPromise();
    const outer = Promise.withResolvers();
    const inner = Promise.withResolvers();
    const output = run(
      { channel: weak.promise, value: outer.promise },
      { signal },
    );
    const root = await output.root;
    outer.resolve({ nested: inner.promise });
    const value = await root.value;
    assert.equal(await state(root.channel), 'pending');
    weak.resolve('late');
    inner.resolve('done');
    assert.equal(await root.channel, 'late');
    assert.equal(await value.nested, 'done');
    await output.bytes;
  },
);

await scenario(
  'readable stream remains strong between items',
  async (signal) => {
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue('first');
        await gate.promise;
        weak.resolve('/stream');
        controller.enqueue('last');
        controller.close();
      },
    });
    const output = run({ channel: weak.promise, stream }, { signal });
    const root = await output.root;
    const reader = root.stream.getReader();
    assert.equal((await reader.read()).value, 'first');
    assert.equal(await state(root.channel), 'pending');
    gate.resolve();
    assert.equal(await root.channel, '/stream');
    assert.equal((await reader.read()).value, 'last');
    assert.equal((await reader.read()).done, true);
    await output.bytes;
  },
);

await scenario(
  'async iterator return values and native shared objects are preserved',
  async (signal) => {
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const shared = { value: Promise.resolve('shared') };
    async function* values() {
      yield shared;
      await gate.promise;
      return new Set([Promise.resolve('last')]);
    }
    const output = run(
      {
        channel: weak.promise,
        map: new Map([['shared', shared]]),
        set: new Set([shared]),
        values: values(),
      },
      { signal },
    );
    const root = await output.root;
    assert.equal(root.map.get('shared'), [...root.set][0]);
    assert.equal(await root.map.get('shared').value, 'shared');
    const first = await root.values.next();
    assert.equal(first.done, false);
    assert.equal(await state(root.channel), 'pending');
    gate.resolve();
    const last = await root.values.next();
    assert.equal(last.done, true);
    assert.equal(await [...last.value][0], 'last');
    await output.bytes;
    await unused(root.channel);
  },
);

await scenario(
  'fragmented binary and text cannot be mistaken for Flight references',
  async (signal) => {
    const weak = createWeakPromise();
    const text = '\n0:{"fake":"$@f"}\n' + '⛩️'.repeat(1000);
    const binary = new TextEncoder().encode(text);
    const expectedBinary = binary.slice();
    const output = run(
      { channel: weak.promise, binary, text },
      { signal, fragment: 1 },
    );
    const root = await output.root;
    assert.deepEqual(root.binary, expectedBinary);
    assert.equal(root.text, text);
    await output.bytes;
    await unused(root.channel);
  },
);

await scenario(
  'raw strings preserve dollar escapes, empty values, unicode, and aliases',
  async (signal) => {
    const values = [
      '',
      '$',
      '$@1',
      '$undefined',
      '$$value',
      '\ud800',
      '⛩️\n"\\nul\0',
    ];
    const data = {};
    for (const [index, value] of values.entries()) {
      const weak = createWeakPromise();
      weak.resolve(value);
      weak.resolve('ignored');
      data['value' + index] = weak.promise;
      data['alias' + index] = weak.promise;
    }
    const output = run(data, { signal, fragment: 1 });
    const root = await output.root;
    for (const [index, value] of values.entries()) {
      assert.equal(root['value' + index], root['alias' + index]);
      assert.equal(await root['value' + index], value);
    }
    await output.bytes;
  },
);

await scenario('ordinary errors allow unused completion', async (signal) => {
  const weak = createWeakPromise();
  const output = run(
    { channel: weak.promise, ordinary: Promise.reject(new Error('expected')) },
    { signal },
  );
  const root = await output.root;
  await assert.rejects(Promise.resolve(root.ordinary));
  await output.bytes;
  await unused(root.channel);
});

await scenario(
  'unused development-only promise props do not block EOF',
  async (signal) => {
    const weak = createWeakPromise();
    function Page(_props) {
      void _props;
      return React.createElement('p', null, 'done');
    }
    const output = run(
      {
        channel: weak.promise,
        page: React.createElement(Page, { unused: new Promise(() => {}) }),
      },
      { signal },
    );
    const root = await output.root;
    await output.bytes;
    await unused(root.channel);
  },
);

await scenario(
  'ordinary render completion is isolated between requests',
  async (signal) => {
    const first = createWeakPromise();
    const second = createWeakPromise();
    const gate = Promise.withResolvers();
    const a = run({ channel: first.promise, ordinary: null }, { signal });
    const b = run(
      { channel: second.promise, ordinary: gate.promise },
      { signal },
    );
    const [rootA, rootB] = await Promise.all([a.root, b.root]);
    await a.bytes;
    await unused(rootA.channel);
    assert.equal(await state(rootB.channel), 'pending');
    second.resolve('/second');
    gate.resolve();
    assert.equal(await rootB.channel, '/second');
    await b.bytes;
  },
);

await scenario(
  'sharing a weak producer keeps active renders independent of completed renders',
  async (signal) => {
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const completed = run(
      { channel: weak.promise, ordinary: null },
      { signal },
    );
    const active = run(
      { channel: weak.promise, ordinary: gate.promise },
      { signal },
    );
    const [completedRoot, activeRoot] = await Promise.all([
      completed.root,
      active.root,
    ]);
    await completed.bytes;
    await unused(completedRoot.channel);
    weak.resolve('/active');
    gate.resolve();
    assert.equal(await activeRoot.channel, '/active');
    await active.bytes;
    await unused(completedRoot.channel);
  },
);

await scenario(
  'renderer abort rejects ordinary data without failing the transport',
  async (signal) => {
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const abort = new AbortController();
    const output = run(
      { channel: weak.promise, ordinary: gate.promise },
      { signal: AbortSignal.any([signal, abort.signal]) },
    );
    const root = await output.root;
    const ordinary = Promise.resolve(root.ordinary).then(
      () => 'fulfilled',
      () => 'rejected',
    );
    abort.abort(new Error('request left'));
    await output.bytes;
    assert.equal(await ordinary, 'rejected');
    await unused(root.channel);
    gate.resolve();
  },
);

if (mode === 'native' || mode === 'filter') {
  await scenario('stream cancellation cancels the native source', async () => {
    const weak = createWeakPromise();
    let cancelled;
    const output = renderWithWeakPromises(
      { channel: weak.promise },
      () =>
        new ReadableStream({
          cancel(reason) {
            cancelled = reason;
          },
        }),
    );
    await output.cancel('left');
    assert.equal(cancelled, 'left');
    weak.resolve('too late');
    assert.equal(await state(weak.promise), 'fulfilled');
  });

  await scenario(
    'transport disconnection rejects pending results without client normalization',
    async (signal) => {
      const weak = createWeakPromise();
      const gate = Promise.withResolvers();
      const disconnect = new AbortController();
      const output = run(
        { channel: weak.promise, ordinary: gate.promise },
        { signal, disconnect },
      );
      const root = await output.root;
      const ordinaryState = Promise.resolve(root.ordinary).then(
        () => 'fulfilled',
        () => 'rejected',
      );
      disconnect.abort(new Error('connection lost'));
      await assert.rejects(output.bytes);
      assert.equal(
        await state(root.channel),
        mode === 'native' ? 'pending' : 'rejected',
      );
      assert.equal(await ordinaryState, 'rejected');
      gate.resolve();
    },
  );
}

await scenario(
  'the matched Flight runtime has the expected native weak capability',
  async () => {
    const weak = createWeakPromise();
    const abort = new AbortController();
    const [forClient, forBytes] = server
      .renderToReadableStream(
        { INTENT: weak.promise, page: null },
        {},
        { signal: abort.signal, onError: () => 'capability-control' },
      )
      .tee();
    const root = await client.createFromReadableStream(forClient, options);
    const bytes = new Response(forBytes).arrayBuffer();
    if (mode === 'native') {
      await bytes;
      await unused(root.INTENT);
    } else {
      assert.equal(await state(bytes), 'pending');
      abort.abort(new Error('clean up expected unsupported weak thenable'));
      await bytes;
    }
  },
);

await scenario(
  'cancellation survives decoding and a second Flight render',
  async () => {
    const errors = [];
    const { createRenderUtils } = await import(
      sourceRoot + 'lib/utils-server/render.ts'
    );
    const { cancelRender } = await import(
      sourceRoot + 'lib/utils-isomorphic/render-cancellation.ts'
    );
    const render = createRenderUtils({
      renderToReadableStream: (data, renderOptions) =>
        server.renderToReadableStream(data, {}, renderOptions),
      temporaryReferences: undefined,
      buildId: '',
      onError: (error) => {
        errors.push(error);
      },
      loadSsrEntryModule: async () => {
        throw new Error('unused');
      },
    });
    async function Page() {
      cancelRender();
    }
    const bytes = await new Response(
      await render.renderRsc({ page: React.createElement(Page) }),
    ).arrayBuffer();
    assert.match(new TextDecoder().decode(bytes), /WAKU_CANCEL_RENDER/);
    const first = await client.createFromReadableStream(
      new Response(bytes).body,
      options,
    );
    const second = await new Response(
      await render.renderRsc({ page: first.page }),
    ).text();
    assert.match(second, /WAKU_CANCEL_RENDER/);
    assert.deepEqual(errors, []);
  },
);

await scenario(
  'Minimal renderRsc preserves the public weak element API',
  async () => {
    const { createRenderUtils } = await import(
      sourceRoot + 'lib/utils-server/render.ts'
    );
    const weak = createWeakPromise();
    let encodes = 0;
    const render = createRenderUtils({
      renderToReadableStream(data, renderOptions) {
        encodes++;
        return server.renderToReadableStream(data, {}, renderOptions);
      },
      temporaryReferences: undefined,
      buildId: '',
      onError: () => 'minimal-probe-error',
      loadSsrEntryModule: async () => {
        throw new Error('unused');
      },
    });
    const stream = await render.renderRsc({ INTENT: weak.promise, page: null });
    const [forClient, forBytes] = stream.tee();
    const root = await client.createFromReadableStream(forClient, options);
    await new Response(forBytes).arrayBuffer();
    assert.equal(await root.INTENT, undefined);
    assert.equal(encodes, 1);
  },
);

await scenario(
  'Minimal renderRsc byte streams preserve the HTML tee branch during decoding',
  async () => {
    const { createRenderUtils } = await import(
      sourceRoot + 'lib/utils-server/render.ts'
    );
    const weak = createWeakPromise();
    const render = createRenderUtils({
      renderToReadableStream: (data, renderOptions) =>
        server.renderToReadableStream(data, {}, renderOptions),
      temporaryReferences: undefined,
      buildId: '',
      onError: () => 'minimal-probe-error',
      loadSsrEntryModule: async () => {
        throw new Error('unused');
      },
    });
    const bytes = new ReadableStream({
      type: 'bytes',
      start(controller) {
        controller.enqueue(new TextEncoder().encode('binary payload'));
        controller.close();
      },
    });
    const [forClient, forHtml] = (
      await render.renderRsc({ INTENT: weak.promise, bytes })
    ).tee();
    const retained = [];
    for await (const chunk of forHtml) {
      retained.push(chunk);
    }
    const expected = Buffer.concat(retained);
    const root = await client.createFromReadableStream(forClient, options);
    assert.equal(await new Response(root.bytes).text(), 'binary payload');
    assert.deepEqual(Buffer.concat(retained), expected);
  },
);

await scenario(
  'Minimal renderRsc preserves weak semantics on transport cancellation',
  async () => {
    const { createRenderUtils } = await import(
      sourceRoot + 'lib/utils-server/render.ts'
    );
    const weak = createWeakPromise();
    const gate = Promise.withResolvers();
    const render = createRenderUtils({
      renderToReadableStream: (data, renderOptions) =>
        server.renderToReadableStream(data, {}, renderOptions),
      temporaryReferences: undefined,
      buildId: '',
      onError: () => 'minimal-probe-error',
      loadSsrEntryModule: async () => {
        throw new Error('unused');
      },
    });
    const abort = new AbortController();
    const stream = await render.renderRsc({
      INTENT: weak.promise,
      ordinary: gate.promise,
    });
    const transport = stream.pipeThrough(new TransformStream(), {
      signal: abort.signal,
    });
    const root = await client.createFromReadableStream(transport, options);
    const ordinaryRejection = assert.rejects(
      Promise.resolve(root.ordinary),
      /transport disconnected/,
    );
    abort.abort(new Error('transport disconnected'));
    await ordinaryRejection;
    assert.equal(await state(root.INTENT), 'rejected');
    gate.resolve();
  },
);

const routerProbeClient =
  'data:text/javascript,' +
  encodeURIComponent(`
    import client from ${JSON.stringify(pathToFileURL(require.resolve('react-server-dom-webpack/client.edge')).href)};
    export const createFromReadableStream = (stream) =>
      client.createFromReadableStream(stream, ${JSON.stringify(options)});
  `);
const routerProbeHooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'waku/minimal/server') {
      return nextResolve(sourceRoot + 'minimal/server.ts', context);
    }
    if (specifier === 'waku/server') {
      return nextResolve(sourceRoot + 'server.ts', context);
    }
    if (specifier === '@vitejs/plugin-rsc/react/rsc/client') {
      return nextResolve(routerProbeClient, context);
    }
    return nextResolve(specifier, context);
  },
});
try {
  const { createElementCache } = await import(
    sourceRoot + 'router/define-router-utils/element-cache.ts'
  );
  const { createRouteEntries } = await import(
    sourceRoot + 'router/define-router-utils/route-entries.ts'
  );
  const { getRouteIntent, runWithRouterStore } = await import(
    sourceRoot + 'router/define-router-utils/request-store.ts'
  );
  const { cancelRender, isRenderCancellation } = await import(
    sourceRoot + 'lib/utils-isomorphic/render-cancellation.ts'
  );
  const { serializeRsc } = await import(sourceRoot + 'server.ts');
  const inRequest = (fn) =>
    runWithRouterStore({ req: new Request('http://localhost/page') }, fn);

  await scenario(
    'Router reuses the serialized outcome of an immutable render',
    async () => {
      let factories = 0;
      let renders = 0;
      const saved = new Map();
      const cache = createElementCache((id, entry) => saved.set(id, entry));
      async function AsyncGuard() {
        await tick();
        if (++renders === 1) cancelRender();
        return 'recovered';
      }
      const entries = createRouteEntries(
        async () => ({
          elements: {
            root: { immutable: true, render: () => 'root' },
            route: {
              immutable: true,
              cacheKey: 'page',
              render: () => {
                factories++;
                return React.createElement(
                  'section',
                  null,
                  React.createElement(AsyncGuard),
                );
              },
            },
          },
        }),
        undefined,
        async () => false,
      );
      await inRequest(async () => {
        const first = await entries.getEntriesForRoute(
          'R/page',
          undefined,
          {},
          cache,
        );
        const bytes = await serializeRsc(first.elements['route:/page']);
        assert.match(new TextDecoder().decode(bytes), /WAKU_CANCEL_RENDER/);
        assert.equal(first.elements.IS_STATIC, true);
        assert.equal(first.etags['route:/page'], 1);
        assert.equal(cache.has('key/page'), true);
        assert.equal(saved.has('key/page'), true);
      });
      await inRequest(async () => {
        const second = await entries.getEntriesForRoute(
          'R/page',
          undefined,
          {},
          cache,
        );
        const bytes = await serializeRsc(second.elements['route:/page']);
        assert.match(new TextDecoder().decode(bytes), /WAKU_CANCEL_RENDER/);
        assert.equal(second.elements.IS_STATIC, true);
        assert.equal(second.etags['route:/page'], 1);
      });
      assert.equal(factories, 1);
      assert.equal(renders, 1);
    },
  );

  await scenario(
    'Router records an intent from a dynamic nested render',
    async () => {
      const cache = createElementCache();
      async function AsyncGuard() {
        await tick();
        getRouteIntent().record({ status: 404 });
        cancelRender();
      }
      const entries = createRouteEntries(
        async () => ({
          elements: {
            root: { immutable: true, render: () => 'root' },
            route: {
              render: () =>
                React.createElement(
                  'section',
                  null,
                  React.createElement(AsyncGuard),
                ),
            },
          },
        }),
        undefined,
        async () => false,
      );
      await inRequest(async () => {
        const entry = await entries.getEntriesForRoute(
          'R/page',
          undefined,
          {},
          cache,
        );
        assert.equal(entry.elements.IS_STATIC, false);
        const bytes = await serializeRsc(entry.elements['route:/page']);
        assert.deepEqual(getRouteIntent().value, { status: 404 });
        assert.match(new TextDecoder().decode(bytes), /WAKU_CANCEL_RENDER/);
      });
    },
  );

  await scenario(
    'Router caches cancellation-like text and binary data',
    async () => {
      const marker = '\n1:E{"digest":"WAKU_CANCEL_RENDER"}\n';
      const text = '長い文字列'.repeat(400) + marker;
      const binary = new TextEncoder().encode(marker);
      const cache = createElementCache();
      await inRequest(async () => {
        await cache.set('slot/page', () =>
          React.createElement('section', { binary }, text),
        );
        const page = await cache.get('slot/page');
        assert.equal(page.props.children, text);
        assert.deepEqual(page.props.binary, binary);
        assert.equal(cache.has('slot/page'), true);
      });
    },
  );
  await scenario(
    'Router retries dynamic renders after cancellation',
    async () => {
      let renders = 0;
      async function AsyncGuard() {
        await tick();
        if (++renders === 1) cancelRender();
        return 'recovered';
      }
      const cache = createElementCache();
      const entries = createRouteEntries(
        async () => ({
          elements: {
            root: { immutable: true, render: () => 'root' },
            route: {
              render: () =>
                React.createElement(
                  'section',
                  null,
                  React.createElement(AsyncGuard),
                ),
            },
          },
        }),
        undefined,
        async () => false,
      );
      for (let attempt = 0; attempt < 2; attempt++) {
        await inRequest(async () => {
          const entry = await entries.getEntriesForRoute(
            'R/page',
            undefined,
            {},
            cache,
          );
          assert.equal(entry.elements.IS_STATIC, false);
          assert.equal(entry.etags['route:/page'], undefined);
          const text = new TextDecoder().decode(
            await serializeRsc(entry.elements['route:/page']),
          );
          if (attempt === 0) assert.match(text, /WAKU_CANCEL_RENDER/);
          else assert.match(text, /recovered/);
        });
      }
      assert.equal(renders, 2);
    },
  );
  await scenario(
    'Router retains request intent when a dynamic element factory cancels',
    async () => {
      const cache = createElementCache();
      const entries = createRouteEntries(
        async () => ({
          elements: {
            root: { immutable: true, render: () => 'root' },
            route: {
              render: () => {
                getRouteIntent().record({ status: 404 });
                cancelRender();
              },
            },
          },
        }),
        undefined,
        async () => false,
      );
      await inRequest(async () => {
        await assert.rejects(
          entries.getEntriesForRoute('R/page', undefined, {}, cache),
          isRenderCancellation,
        );
        assert.deepEqual(getRouteIntent().value, { status: 404 });
      });
    },
  );
} finally {
  routerProbeHooks.deregister();
}

console.log(
  JSON.stringify(
    { mode, versions, nodeEnv: process.env.NODE_ENV, results },
    null,
    2,
  ),
);
process.exitCode = results.some((item) => item.result === 'fail') ? 1 : 0;
