import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { streamToBytes } from '../lib/utils/stream.js';

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(renderToReadableStream(element, {}));
}
