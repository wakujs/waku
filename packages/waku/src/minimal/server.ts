import type { Unstable_ServerEntry as ServerEntry } from '../lib/types.js';

export function unstable_defineServer(fns: ServerEntry['default']) {
  return fns;
}
