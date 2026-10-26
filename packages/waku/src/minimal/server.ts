import type { buildElements } from '../lib/utils-server/build-elements.js';

export {
  cancelRender as unstable_cancelRender,
  cancelRenderStream as unstable_cancelRenderStream,
  hasRenderCancellationDigest as unstable_hasRenderCancellationDigest,
  isRenderCancellation as unstable_isRenderCancellation,
} from '../lib/utils-isomorphic/render-cancellation.js';
export { createWeakPromise as unstable_createWeakPromise } from '../lib/utils-server/weak-promise.js';

export type {
  Handlers as Unstable_Handlers,
  HandleRequest as Unstable_HandleRequest,
  HandleBuild as Unstable_HandleBuild,
  RenderRsc as Unstable_RenderRsc,
  RenderHtml as Unstable_RenderHtml,
  RenderHtmlFallback as Unstable_RenderHtmlFallback,
} from '../lib/types.js';
export type { Etags as Unstable_Etags } from '../lib/utils-isomorphic/etags.js';
export { buildElements as unstable_buildElements } from '../lib/utils-server/build-elements.js';
export { formatRscUrl as unstable_formatRscUrl } from '../lib/utils-isomorphic/rsc-path.js';
export { parseRequest as unstable_parseRequest } from '../lib/utils-server/request-url.js';

export type { ElementSource as Unstable_ElementSource } from '../lib/utils-server/build-elements.js';

/** An element record and its etags, with slots held by the client omitted. */
export type Unstable_BuiltElements = Awaited<ReturnType<typeof buildElements>>;
