import { expect, test, vi } from 'vitest';
import { renderWithWeakPromises } from '../src/lib/utils-server/weak-promise-stream.js';
import { createWeakPromise } from '../src/lib/utils-server/weak-promise.js';

const encoder = new TextEncoder();

function controlledRender(data: Record<string, unknown>) {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let markers!: Record<string, unknown>;
  const cancel = vi.fn();
  const output = renderWithWeakPromises(data, (model) => {
    markers = model;
    return new ReadableStream({
      start(controller) {
        source = controller;
      },
      cancel,
    });
  });
  return { source, markers, output, cancel };
}

test('EOF completes a pending BYOB read after the weak value was published', async () => {
  const weak = createWeakPromise();
  weak.resolve('ready');
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  const reader = output.getReader({ mode: 'byob' });
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await markers.INTENT) + '\n0:{"INTENT":"$@1"}\n',
    ),
  );
  expect(
    new TextDecoder().decode((await reader.read(new Uint8Array(1024))).value),
  ).toBe('1:"ready"\n0:{"INTENT":"$@1"}\n');
  const pending = reader.read(new Uint8Array(1024));
  source.close();
  await reader.closed;
  await expect(pending).resolves.toEqual({
    done: true,
    value: new Uint8Array(0),
  });
});

test('tee branches keep independent buffers when a consumer transfers a chunk', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  const root = '0:{"INTENT":"$@1"}\n';
  source.enqueue(
    encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n' + root),
  );
  source.close();
  const [decoded, injected] = output.tee();
  const decodedReader = decoded.getReader();
  const injectedReader = injected.getReader();
  const decodedChunk = (await decodedReader.read()).value!;
  const injectedChunk = (await injectedReader.read()).value!;
  structuredClone(decodedChunk.buffer, { transfer: [decodedChunk.buffer] });
  expect(decodedChunk.byteLength).toBe(0);
  expect(injectedChunk).toEqual(encoder.encode(root));
  await Promise.all([decodedReader.cancel(), injectedReader.cancel()]);
});

test('buffered text survives transferring the preceding binary tail', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  source.enqueue(
    encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n2:b4,AB'),
  );
  const reader = output.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('2:b4,AB');
  source.enqueue(encoder.encode('CD3:{"text":"hel'));
  const tail = (await reader.read()).value!;
  expect(new TextDecoder().decode(tail)).toBe('CD');
  structuredClone(tail.buffer, { transfer: [tail.buffer] });
  source.enqueue(encoder.encode('lo"}\n'));
  source.close();
  let actual = '';
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    actual += new TextDecoder().decode(part.value);
  }
  expect(actual).toBe('3:{"text":"hello"}\n1:"$undefined"\n');
});

test('weak publication precedes a buffered ordinary row', async () => {
  const weak = createWeakPromise();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let marker: unknown;
  const output = renderWithWeakPromises({ INTENT: weak.promise }, (model) => {
    marker = model.INTENT;
    return new ReadableStream({
      start(controller) {
        source = controller;
      },
    });
  });
  const text = new Response(output).text();
  const prefix = 'x'.repeat(256);
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await marker) + '\n0:{"text":"' + prefix,
    ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  weak.resolve('intent');
  source.enqueue(encoder.encode('tail"}\n'));
  source.close();
  const actual = await text;
  const ordinary = '0:{"text":"' + prefix + 'tail"}\n';
  expect(actual).toContain(ordinary);
  expect(actual).toBe('1:"intent"\n' + ordinary);
});

test('embedded binary newlines cannot become weak publication boundaries', async () => {
  const weak = createWeakPromise();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let marker: unknown;
  const output = renderWithWeakPromises({ INTENT: weak.promise }, (model) => {
    marker = model.INTENT;
    return new ReadableStream({
      start(controller) {
        source = controller;
      },
    });
  });
  const payload = 'first\nsecond\n';
  const header = '2:o' + payload.length.toString(16) + ',';
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await marker) + '\n' + header + 'first\n',
    ),
  );
  const reader = output.getReader();
  const first = await reader.read();
  const parts = [first.value!];
  weak.resolve('intent');
  source.enqueue(encoder.encode('second\n0:{"data":"$2","INTENT":"$@1"}\n'));
  source.close();
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    parts.push(part.value);
  }
  const actual = await new Response(
    new Blob(parts.map((part) => new Uint8Array(part))),
  ).text();
  expect(actual).toContain(header + payload);
  expect(actual.indexOf('1:"intent"\n')).toBeGreaterThanOrEqual(
    header.length + payload.length,
  );
});

test('coalesced resolutions publish before buffered text rows', async () => {
  const first = createWeakPromise();
  const second = createWeakPromise();
  const { source, markers, output } = controlledRender({
    FIRST: first.promise,
    ALIAS: first.promise,
    SECOND: second.promise,
  });
  expect(markers.ALIAS).toBe(markers.FIRST);
  const prefix = '0:{"text":"' + 'x'.repeat(256);
  source.enqueue(
    encoder.encode(
      '1:' +
        JSON.stringify(await markers.FIRST) +
        '\n' +
        '2:' +
        JSON.stringify(await markers.SECOND) +
        '\n3:{"FIRST":"$@1","SECOND":"$@2"}\n' +
        prefix,
    ),
  );
  const reader = output.getReader();
  const decoder = new TextDecoder();
  let actual = decoder.decode((await reader.read()).value);
  expect(actual).toBe('3:{"FIRST":"$@1","SECOND":"$@2"}\n');
  first.resolve('');
  second.resolve('$@literal');
  first.resolve('ignored');
  const published = '1:""\n2:"$$@literal"\n';
  while (!actual.includes(published)) {
    const part = await reader.read();
    expect(part.done).toBe(false);
    actual += decoder.decode(part.value);
  }
  expect(actual).toBe('3:{"FIRST":"$@1","SECOND":"$@2"}\n' + published);
  source.enqueue(encoder.encode('tail"}\n4:{"next":"unfinished'));
  source.enqueue(encoder.encode(' tail"}\n'));
  source.close();
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    actual += decoder.decode(part.value);
  }
  expect(actual).toBe(
    '3:{"FIRST":"$@1","SECOND":"$@2"}\n' +
      published +
      prefix +
      'tail"}\n4:{"next":"unfinished tail"}\n',
  );
});

test('resolution at a boundary publishes while the source is idle', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await markers.INTENT) + '\n0:{"INTENT":"$@1"}\n',
    ),
  );
  const reader = output.getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toBe(
    '0:{"INTENT":"$@1"}\n',
  );
  const publication = reader.read();
  weak.resolve('late');
  expect(new TextDecoder().decode((await publication).value)).toBe(
    '1:"late"\n',
  );
  source.close();
  expect((await reader.read()).done).toBe(true);
});

test('source closure stops weak publication while output reads are paused', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  const root = '0:{"INTENT":"$@1"}\n';
  source.enqueue(
    encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n' + root),
  );
  const reader = output.getReader();
  try {
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(root);
    source.close();
    await new Promise<void>((resolve) => setImmediate(resolve));
    weak.resolve('too late');
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(
      '1:"$undefined"\n',
    );
    expect((await reader.read()).done).toBe(true);
  } finally {
    await reader.cancel();
  }
});

test('source failure rejects paused output before a later weak resolution', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  const root = '0:{"INTENT":"$@1"}\n';
  source.enqueue(
    encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n' + root),
  );
  const reader = output.getReader();
  const closed = reader.closed.catch((error: unknown) => error);
  const error = new Error('source failed');
  try {
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(root);
    source.error(error);
    await new Promise<void>((resolve) => setImmediate(resolve));
    weak.resolve('too late');
    await expect(reader.read()).rejects.toBe(error);
    expect(await closed).toBe(error);
  } finally {
    await reader.cancel().catch(() => {});
  }
});

test.each(['2:', '2:o4', '2:{"value":"'])(
  'weak publication precedes a buffered partial record: %s',
  async (prefix) => {
    const weak = createWeakPromise();
    const { source, markers, output } = controlledRender({
      INTENT: weak.promise,
    });
    const root = '0:{"INTENT":"$@1"}\n';
    source.enqueue(
      encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n' + root),
    );
    const reader = output.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe(root);
    const published = vi.fn();
    const publication = reader
      .read()
      .then((part) => published(new TextDecoder().decode(part.value)));
    try {
      source.enqueue(encoder.encode(prefix));
      await new Promise<void>((resolve) => setImmediate(resolve));
      weak.resolve('late');
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(published).toHaveBeenCalledExactlyOnceWith('1:"late"\n');
    } finally {
      await reader.cancel();
      await publication;
    }
  },
);

test('one-byte chunks preserve UTF-8, binary, aliases and unused EOF completion', async () => {
  const resolved = createWeakPromise();
  const unused = createWeakPromise();
  const value = '$\n日本語⛩️\ud800';
  resolved.resolve(value);
  const { source, markers, output } = controlledRender({
    RESOLVED: resolved.promise,
    ALIAS: resolved.promise,
    UNUSED: unused.promise,
  });
  expect(markers.ALIAS).toBe(markers.RESOLVED);
  const root = '0:{"RESOLVED":"$@1","ALIAS":"$@1","UNUSED":"$@2"}\n';
  const text = '日本語⛩️\n1:"not a marker"\n';
  const binary = new Uint8Array([0, 255, 10, 49, 58, 34, 10, 44]);
  const ordinary = new Uint8Array([
    ...encoder.encode(
      '3:T' + encoder.encode(text).length.toString(16) + ',' + text,
    ),
    ...encoder.encode('4:o' + binary.length.toString(16) + ','),
    ...binary,
    ...encoder.encode('5:"done"\n'),
  ]);
  const input = new Uint8Array([
    ...encoder.encode(
      root +
        '1:' +
        JSON.stringify(await markers.RESOLVED) +
        '\n' +
        '2:' +
        JSON.stringify(await markers.UNUSED) +
        '\n',
    ),
    ...ordinary,
  ]);
  for (const byte of input) {
    source.enqueue(new Uint8Array([byte]));
  }
  source.close();
  const actual = new Uint8Array(await new Response(output).arrayBuffer());
  expect(actual).toEqual(
    new Uint8Array([
      ...encoder.encode(root + '1:' + JSON.stringify('$' + value) + '\n'),
      ...ordinary,
      ...encoder.encode('2:"$undefined"\n'),
    ]),
  );
});

test('fragmented ordinary records retain their bytes after subsequent records', async () => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  const first = '0:{"INTENT":"$@1","value":"first"}\n';
  const second = '2:{"value":"second"}\n';
  const input =
    first + '1:' + JSON.stringify(await markers.INTENT) + '\n' + second;
  for (const byte of encoder.encode(input)) {
    source.enqueue(new Uint8Array([byte]));
  }
  source.close();
  const reader = output.getReader();
  const parts: Uint8Array[] = [];
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    parts.push(part.value);
  }
  const actual = await new Response(
    new Blob(parts.map((part) => new Uint8Array(part))),
  ).text();
  expect(actual).toBe(first + second + '1:"$undefined"\n');
});

test('cancellation before a safe boundary avoids encoding a large resolved value', async () => {
  const weak = createWeakPromise();
  const { source, markers, output, cancel } = controlledRender({
    INTENT: weak.promise,
  });
  source.enqueue(
    encoder.encode(
      '1:' +
        JSON.stringify(await markers.INTENT) +
        '\n0:o200,' +
        'x'.repeat(256),
    ),
  );
  const reader = output.getReader();
  await reader.read();
  const encode = vi.spyOn(TextEncoder.prototype, 'encode');
  try {
    weak.resolve('y'.repeat(1024 * 1024));
    expect(encode).not.toHaveBeenCalled();
    const reason = new Error('consumer cancelled');
    await reader.cancel(reason);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(reason);
    expect(encode).not.toHaveBeenCalled();
    expect((await reader.read()).done).toBe(true);
  } finally {
    encode.mockRestore();
  }
});

test.each([
  'a',
  '2:o',
  '2:o4,abc',
  '0:{"text":"unfinished',
  '0:{"text":"' + 'x'.repeat(256),
])('EOF rejects a truncated Flight record: %s', async (tail) => {
  const weak = createWeakPromise();
  const { source, markers, output } = controlledRender({
    INTENT: weak.promise,
  });
  source.enqueue(
    encoder.encode('1:' + JSON.stringify(await markers.INTENT) + '\n' + tail),
  );
  source.close();
  await expect(new Response(output).text()).rejects.toThrow(
    'Truncated Flight record',
  );
});

test('source completion drains marker-only chunks and queued records without output reads', async () => {
  const weak = createWeakPromise();
  let reads = 0;
  const output = renderWithWeakPromises(
    { INTENT: weak.promise },
    (model) =>
      new ReadableStream(
        {
          async pull(controller) {
            reads++;
            controller.enqueue(
              encoder.encode(
                reads === 1
                  ? '1:' + JSON.stringify(await model.INTENT) + '\n'
                  : '0:{"INTENT":"$@1"}\n',
              ),
            );
            if (reads === 2) {
              controller.close();
            }
          },
        },
        { highWaterMark: 0 },
      ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(reads).toBe(2);
  weak.resolve('too late');
  expect(await new Response(output).text()).toBe(
    '0:{"INTENT":"$@1"}\n1:"$undefined"\n',
  );
});
