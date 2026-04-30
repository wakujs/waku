import { describe, expect, test, vi } from 'vitest';
import { createRenderUtils } from '../src/lib/utils/render.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const streamFromText = (text: string) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });

const readText = async (stream: ReadableStream) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    chunks.push(value);
  }
  return decoder.decode(
    Uint8Array.from(chunks.flatMap((chunk) => Array.from(chunk))),
  );
};

describe('createRenderUtils', () => {
  test('serializeRsc and deserializeRsc operate on one element without renderRsc options', async () => {
    const renderToReadableStream = vi.fn(
      (data: unknown, options?: object, extraOptions?: object) => {
        expect(options).toEqual({ onError: expect.any(Function) });
        expect(extraOptions).toBeUndefined();
        return streamFromText(String(data));
      },
    );
    const createFromReadableStream = vi.fn((stream: ReadableStream) =>
      readText(stream),
    );
    const debugChannel = {
      readable: new ReadableStream(),
      writable: new WritableStream(),
    };

    const utils = createRenderUtils(
      'temporaryReferences',
      renderToReadableStream,
      createFromReadableStream,
      async () => ({}) as never,
      debugChannel,
      'debug-id',
    );

    const bytes = await utils.serializeRsc('cached element');
    expect(decoder.decode(bytes)).toBe('cached element');
    expect(renderToReadableStream).toHaveBeenCalledWith('cached element', {
      onError: expect.any(Function),
    });

    await expect(utils.deserializeRsc(bytes)).resolves.toBe('cached element');
  });
});
