import type { Unstable_CreateServerEntryAdapter as CreateServerEntryAdapter } from '../lib/types.js';
// HACK relying on vite is only for this adapter
import { getConfigAdapter } from '../lib/vite-rsc/handler.js';

const adapter: ReturnType<CreateServerEntryAdapter> = (
  await import(getConfigAdapter())
).default;

export default adapter;
