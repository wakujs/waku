declare global {
  var __WAKU_RSC_RELOAD_LISTENERS__: (() => void)[] | undefined;
  var __WAKU_REFETCH_RSC__: (() => void) | undefined;
  var __WAKU_REFETCH_ROUTE__: (() => void) | undefined;
  var __WAKU_START_PREVIEW_SERVER__:
    | (() => Promise<import('./vite-rsc/preview.js').PreviewServer>)
    | undefined;
}
