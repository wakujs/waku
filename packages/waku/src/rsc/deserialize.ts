import { createFromReadableStream } from 'react-server-dom-webpack/client.edge';
import { bytesToStream } from '../lib/utils/stream.js';

// This entry evaluates the RSC client runtime. It is deliberately kept
// separate from `waku/rsc/serialize` and `waku/server` so that importing
// those does not pull the client protocol into the rsc environment.
export async function deserializeRsc(bytes: Uint8Array): Promise<unknown> {
  return createFromReadableStream(bytesToStream(bytes));
}
