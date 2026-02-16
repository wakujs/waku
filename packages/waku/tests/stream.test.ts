import { describe, expect, test } from 'vitest';
import {
  base64ToStream,
  batchReadableStream,
  consumeMultiplexedStream,
  produceMultiplexedStream,
  streamToBase64,
  stringToStream,
} from '../src/lib/utils/stream.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const toUint8 = (value: string): Uint8Array => enc.encode(value);

const concatUint8 = (chunks: readonly Uint8Array[]): Uint8Array => {
  if (chunks.length === 1) {
    return chunks[0]!;
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

const readAllChunks = async (
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array[]> => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    if (value) {
      chunks.push(value);
    }
  }
  return chunks;
};

const readAllText = async (stream: ReadableStream<Uint8Array>) => {
  const chunks = await readAllChunks(stream);
  return dec.decode(concatUint8(chunks));
};

describe('stringToStream', () => {
  test('creates a readable stream that emits the utf-8 bytes of the string', async () => {
    const stream = stringToStream('hello world');
    await expect(readAllText(stream)).resolves.toBe('hello world');
  });
});

describe('streamToBase64/base64ToStream', () => {
  test('round-trips utf-8 content through base64', async () => {
    const input = 'hello world';
    const base64 = await streamToBase64(stringToStream(input));
    const output = await readAllText(base64ToStream(base64));
    expect(output).toBe(input);
  });

  test('handles full-range binary bytes', async () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      bytes[i] = i;
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });

    const base64 = await streamToBase64(stream);
    const decoded = concatUint8(await readAllChunks(base64ToStream(base64)));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  test('handles binary data split across chunks', async () => {
    const bytes = new Uint8Array(10);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i * 7;
    }
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 4));
        controller.enqueue(bytes.slice(4, 7));
        controller.enqueue(bytes.slice(7));
        controller.close();
      },
    });

    const base64 = await streamToBase64(stream);
    const decoded = concatUint8(await readAllChunks(base64ToStream(base64)));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  test('streamToBase64 throws on non-Uint8Array chunks', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue('oops' as never);
        controller.close();
      },
    }) as ReadableStream<Uint8Array>;

    await expect(streamToBase64(stream)).rejects.toThrow(
      'Unexpected buffer type',
    );
  });

  test('base64ToStream yields the original bytes', async () => {
    const bytes = toUint8('waku');
    const base64 = btoa(String.fromCharCode(...bytes));
    const decoded = concatUint8(await readAllChunks(base64ToStream(base64)));
    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });
});

describe('batchReadableStream', () => {
  test('batches immediately enqueued chunks into one chunk', async () => {
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(toUint8('a'));
        controller.enqueue(toUint8('b'));
        controller.enqueue(toUint8('c'));
        controller.close();
      },
    });

    const output = await readAllChunks(batchReadableStream(input));
    expect(output).toHaveLength(1);
    expect(dec.decode(output[0]!)).toBe('abc');
  });

  test('emits multiple chunks when input is spaced out', async () => {
    const input = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(toUint8('a'));
        await new Promise((resolve) => setTimeout(resolve, 5));
        controller.enqueue(toUint8('b'));
        controller.close();
      },
    });

    const output = await readAllChunks(batchReadableStream(input));
    expect(output).toHaveLength(2);
    expect(output.map((chunk) => dec.decode(chunk))).toEqual(['a', 'b']);
  });
});

describe('produceMultiplexedStream/consumeMultiplexedStream', () => {
  test('multiplexes multiple streams and delivers data by key', async () => {
    const source = produceMultiplexedStream(async (callback) => {
      await callback(
        'alpha',
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(toUint8('foo'));
            controller.enqueue(toUint8('bar'));
            controller.close();
          },
        }),
      );
      await callback('beta', stringToStream('baz'));
    });

    const received = new Map<string, string>();
    await consumeMultiplexedStream(source, async (key, stream) => {
      received.set(key, await readAllText(stream));
    });

    expect(received).toEqual(
      new Map([
        ['alpha', 'foobar'],
        ['beta', 'baz'],
      ]),
    );
  });

  test('propagates stream errors to the consumer stream', async () => {
    const source = produceMultiplexedStream(async (callback) => {
      let sent = false;
      await callback(
        'broken',
        new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!sent) {
              sent = true;
              controller.enqueue(toUint8('ok'));
            } else {
              controller.error(new Error('boom'));
            }
          },
        }),
      );
    });

    const results: { data: string; error?: unknown } = { data: '' };
    await consumeMultiplexedStream(source, async (key, stream) => {
      expect(key).toBe('broken');
      const reader = stream.getReader();
      const first = await reader.read();
      results.data = dec.decode(first.value);
      try {
        await reader.read();
      } catch (err) {
        results.error = err;
      }
    });

    expect(results.data).toBe('ok');
    expect(results.error).toBe('Error: boom');
  });
});
