import type {
  Unstable_Handlers as Handlers,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';

export function unstable_defineHandlers(handlers: Handlers) {
  return handlers;
}

export function unstable_defineServerEntry(fns: ServerEntry) {
  return fns;
}
