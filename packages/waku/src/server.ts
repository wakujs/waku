import { createFromReadableStream } from 'react-server-dom-webpack/client.edge';
import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { getRequest } from './lib/context.js';
import { bytesToStream, streamToBytes } from './lib/utils/stream.js';

export { getRequest as unstable_getRequest } from './lib/context.js';

export { getEnv } from './lib/env.js';

export function unstable_getHeaders(): Readonly<Record<string, string>> {
  return Object.fromEntries(getRequest().headers.entries());
}

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(renderToReadableStream(element, {}));
}

export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  return createFromReadableStream(bytesToStream(bytes));
}
