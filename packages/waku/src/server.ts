import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { bytesToStream, streamToBytes } from './lib/utils/stream.js';

export { getEnv } from './lib/env.js';

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(renderToReadableStream(element, {}));
}

// The RSC client runtime is imported lazily so that it stays out of the rsc
// environment's startup graph. Importing `waku/server` — or reaching it through
// the built-in router's element cache — must not pull in the client protocol;
// only an actual deserialization does.
export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  const { createFromReadableStream } =
    await import('react-server-dom-webpack/client.edge');
  return createFromReadableStream(bytesToStream(bytes));
}
