import type {
  Unstable_HandleRequest as HandleRequest,
  Unstable_HandleBuild as HandleBuild,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';

export function unstable_defineHandlers(handlers: {
  handleRequest: HandleRequest;
  handleBuild: HandleBuild;
}) {
  return handlers;
}

export function unstable_defineServerEntry(fns: ServerEntry['default']) {
  return fns;
}
