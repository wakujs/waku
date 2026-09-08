import { describe, expect, test, vi } from 'vitest';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const readText = async (stream: ReadableStream<Uint8Array>) => {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
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

const rsdwClient = vi.hoisted(() => ({
  createFromReadableStream: vi.fn((stream: ReadableStream<Uint8Array>) =>
    readText(stream),
  ),
}));

const rsdwServer = vi.hoisted(() => ({
  renderToReadableStream: vi.fn((element: unknown, _webpackMap: object) => {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(String(element)));
        controller.close();
      },
    });
  }),
}));

vi.mock('react-server-dom-webpack/client.edge', () => ({
  createFromReadableStream: rsdwClient.createFromReadableStream,
}));

vi.mock('react-server-dom-webpack/server.edge', () => ({
  renderToReadableStream: rsdwServer.renderToReadableStream,
}));

describe('waku/server RSC helpers', () => {
  test('serializeRsc and deserializeRsc operate on one element', async () => {
    const { deserializeRsc, serializeRsc } = await import('../src/server.js');

    const bytes = await serializeRsc('cached element');
    expect(decoder.decode(bytes)).toBe('cached element');
    expect(rsdwServer.renderToReadableStream).toHaveBeenCalledWith(
      'cached element',
      {},
    );

    await expect(deserializeRsc(bytes)).resolves.toBe('cached element');
    expect(rsdwClient.createFromReadableStream).toHaveBeenCalledWith(
      expect.any(ReadableStream),
    );
  });
});
