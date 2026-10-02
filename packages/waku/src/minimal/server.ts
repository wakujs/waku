import type {
  Unstable_Handlers as Handlers,
  Unstable_ServerEntry as ServerEntry,
} from '../lib/types.js';
import { base64ToBytes, bytesToBase64 } from '../lib/utils/base64-web.js';
import { buildElements } from '../lib/utils/build-elements.js';
import { getGrouplessPath } from '../lib/utils/create-pages.js';
import { isIgnoredPath } from '../lib/utils/fs-router.js';

export type {
  Unstable_Handlers,
  Unstable_HandleRequest,
  Unstable_HandleBuild,
  Unstable_RenderRsc,
  Unstable_RenderHtml,
} from '../lib/types.js';
export type { Etags as Unstable_Etags } from '../lib/utils/etags.js';
export {
  createCustomError as unstable_createCustomError,
  getErrorInfo as unstable_getErrorInfo,
} from '../lib/utils/custom-errors.js';

/** @deprecated Pass a handler object to an adapter, annotated with `Unstable_Handlers` if needed. */
export function unstable_defineHandlers(handlers: Handlers) {
  return handlers;
}

/** @deprecated Annotate a server entry with `Unstable_ServerEntry` from `waku/adapter-builders`. */
export function unstable_defineServerEntry(fns: ServerEntry) {
  return fns;
}

export type {
  /** @deprecated Slot validator omission is reserved for framework internals. */
  ElementSource as Unstable_ElementSource,
} from '../lib/utils/build-elements.js';

/** @deprecated Use element records and renderRsc's etags option directly. */
export type Unstable_BuiltElements = Awaited<ReturnType<typeof buildElements>>;

/** @deprecated Slot validator omission is reserved for framework internals. */
export const unstable_buildElements = buildElements;

/** @deprecated Build-cache serialization is reserved for framework internals. */
export const unstable_base64ToBytes = base64ToBytes;

/** @deprecated Build-cache serialization is reserved for framework internals. */
export const unstable_bytesToBase64 = bytesToBase64;

/** @deprecated Route-group handling is reserved for Waku Router internals. */
export const unstable_getGrouplessPath = getGrouplessPath;

/** @deprecated Filesystem-route conventions are reserved for Waku Router internals. */
export const unstable_isIgnoredPath = isIgnoredPath;
