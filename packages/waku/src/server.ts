import { renderToReadableStream } from 'react-server-dom-webpack/server.edge';
import { getDigest, getErrorInfo } from './lib/utils/custom-errors.js';
import { sanitizeLog } from './lib/utils/log.js';
import { bytesToStream, streamToBytes } from './lib/utils/stream.js';

export { getEnv } from './lib/env.js';

export async function serializeRsc(element: unknown): Promise<Uint8Array> {
  return streamToBytes(
    renderToReadableStream(
      element,
      {},
      {
        // react drops the digest unless a handler returns it, and waku reads
        // its own control flow back out of that digest after the round trip
        onError: (e: unknown) => {
          if (!getErrorInfo(e)) {
            console.error('Error during rendering:', sanitizeLog(e));
          }
          return getDigest(e);
        },
      },
    ),
  );
}

export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  // Lazy import to keep the RSC client runtime out of the rsc startup graph.
  const { createFromReadableStream } =
    await import('react-server-dom-webpack/client.edge');
  return createFromReadableStream(bytesToStream(bytes));
}
