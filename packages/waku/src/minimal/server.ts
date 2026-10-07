import type { buildElements } from '../lib/utils-server/build-elements.js';

export type {
  Unstable_Handlers,
  Unstable_HandleRequest,
  Unstable_HandleBuild,
  Unstable_RenderRsc,
  Unstable_RenderHtml,
  Unstable_RenderHtmlFallback,
} from '../lib/types.js';
export type { Etags as Unstable_Etags } from '../lib/utils-isomorphic/etags.js';
export { buildElements as unstable_buildElements } from '../lib/utils-server/build-elements.js';
export {
  createCustomError as unstable_createCustomError,
  getErrorInfo as unstable_getErrorInfo,
} from '../lib/utils-isomorphic/custom-errors.js';
export {
  formatRscUrl as unstable_formatRscUrl,
  parseRequest as unstable_parseRequest,
} from '../lib/utils-server/request-url.js';

export type { ElementSource as Unstable_ElementSource } from '../lib/utils-server/build-elements.js';

/** An element record and its etags, with slots held by the client omitted. */
export type Unstable_BuiltElements = Awaited<ReturnType<typeof buildElements>>;
