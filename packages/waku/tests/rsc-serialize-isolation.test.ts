import { expect, test, vi } from 'vitest';

// Sentinel modules that record evaluation. Mock factories are lazy, so these
// only run if something in the imported graph actually pulls the module in.
const evaluated = vi.hoisted(() => ({ client: 0, server: 0 }));

vi.mock('react-server-dom-webpack/client.edge', () => {
  evaluated.client += 1;
  return { createFromReadableStream: vi.fn() };
});

vi.mock('react-server-dom-webpack/server.edge', () => {
  evaluated.server += 1;
  return {
    renderToReadableStream: vi.fn(
      () =>
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
            controller.close();
          },
        }),
    ),
  };
});

// This file must import nothing but the serialize entry, so the counters stay
// meaningful. Deserialization is covered in server-rsc.test.ts.
test('importing waku/rsc/serialize does not evaluate the RSC client runtime', async () => {
  const { serializeRsc } = await import('../src/rsc/serialize.js');

  expect(evaluated.server).toBe(1);
  expect(evaluated.client).toBe(0);

  await serializeRsc('element');

  expect(evaluated.client).toBe(0);
});
