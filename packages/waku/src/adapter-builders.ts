export { createServerEntryAdapter as unstable_createServerEntryAdapter } from './lib/vite-rsc/handler.js';
import { startPreviewServer } from './lib/vite-rsc/preview.js';

/**
 * @deprecated Use `unstable_startPreviewServer` from the utils passed to the
 * server entry's `build` hook.
 */
export const unstable_startPreviewServer = startPreviewServer;

export type { ServerEntry as Unstable_ServerEntry } from './lib/types.js';
