import { setServerCallback } from '@vitejs/plugin-rsc/browser';
import { unstable_callServerRsc } from '../../minimal/client.js';
setServerCallback(unstable_callServerRsc);

const CSS_FILE_RE = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;
const CSS_MODULE_FILE_RE =
  /\.module\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)$/;

const stripBasePath = (pathname: string) => {
  const basePath = import.meta.env.WAKU_CONFIG_BASE_PATH;
  if (basePath !== '/' && pathname.startsWith(basePath)) {
    return pathname.slice(basePath.length - 1);
  }
  return pathname;
};

const refreshStylesheetLinks = (file: string) => {
  const normalizedFile = file.replace(/\\/g, '/');
  document
    .querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')
    .forEach((link) => {
      const url = new URL(link.href, window.location.href);
      const pathname = decodeURIComponent(stripBasePath(url.pathname));
      if (!normalizedFile.endsWith(pathname)) {
        return;
      }
      url.searchParams.set('t', Date.now().toString());
      link.href = url.href;
    });
};

if (import.meta.hot) {
  import.meta.hot.on('rsc:update', (e?: { file?: string; type?: string }) => {
    console.log('[rsc:update]', e);
    const file = e?.file?.split(/[?#]/, 1)[0];
    if (
      file &&
      !e?.type &&
      CSS_FILE_RE.test(file) &&
      !CSS_MODULE_FILE_RE.test(file)
    ) {
      refreshStylesheetLinks(file);
      return;
    }
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((l) => l());
  });
}

if (import.meta.env.WAKU_BUILD_ID) {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}

import 'virtual:vite-rsc-waku/client-entry';
