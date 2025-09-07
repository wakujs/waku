import type {
  ServerEntries,
  unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';

export function unstable_defineEntries(fns: ServerEntries['default']) {
  return fns;
}

export function unstable_defineServer(fns: ServerEntry['default']) {
  return fns;
}
