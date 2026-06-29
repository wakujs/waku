import type {
  Unstable_Handlers as Handlers,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';
import { IMMUTABLE_ETAG } from '../lib/utils/etags.js';
import type { Etags } from '../lib/utils/etags.js';

export function unstable_defineHandlers(handlers: Handlers) {
  return handlers;
}

export function unstable_defineServerEntry(fns: ServerEntry) {
  return fns;
}

export type Unstable_Etags = Etags;

export type Unstable_ElementSource = {
  immutable?: boolean;
  getEtag?: (() => Promise<string | undefined>) | undefined;
  render: () => unknown | Promise<unknown>;
};

export type Unstable_BuiltElements = {
  elements: Record<string, unknown>;
  etags: Etags;
};

export const unstable_buildElements = async (
  clientEtags: Etags,
  elementSources: Record<string, Unstable_ElementSource>,
): Promise<Unstable_BuiltElements> => {
  const elements: Record<string, unknown> = {};
  const etags: Etags = {};
  await Promise.all(
    Object.entries(elementSources).map(async ([slotId, elementSource]) => {
      // '' is the reserved clear sentinel, so an empty getEtag means no etag
      const etag = elementSource.immutable
        ? IMMUTABLE_ETAG
        : (await elementSource.getEtag?.()) || undefined;
      if (etag !== undefined && etag === clientEtags[slotId]) {
        return;
      }
      elements[slotId] = await elementSource.render();
      if (etag !== undefined) {
        etags[slotId] = etag;
      } else if (clientEtags[slotId] !== undefined) {
        // clear the client's now-stale tag
        etags[slotId] = '';
      }
    }),
  );
  return { elements, etags };
};

// Expose internal APIs
// Subject to change without notice
export {
  base64ToBytes as unstable_base64ToBytes,
  bytesToBase64 as unstable_bytesToBase64,
} from '../lib/utils/base64-web.js';
export {
  createCustomError as unstable_createCustomError,
  getErrorInfo as unstable_getErrorInfo,
} from '../lib/utils/custom-errors.js';
export { getGrouplessPath as unstable_getGrouplessPath } from '../lib/utils/create-pages.js';
export { isIgnoredPath as unstable_isIgnoredPath } from '../lib/utils/fs-router.js';
