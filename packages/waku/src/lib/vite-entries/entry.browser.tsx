import { setServerCallback } from '@vitejs/plugin-rsc/browser';
import { unstable_callServerRsc } from '../../minimal/client.js';
setServerCallback(unstable_callServerRsc);

if (import.meta.hot) {
  import.meta.hot.on('rsc:update', (e) => {
    console.log('[rsc:update]', e);
    globalThis.__WAKU_RSC_RELOAD_LISTENERS__?.forEach((l) => l());
  });
}

if (import.meta.env.WAKU_BUILD_ID) {
  window.addEventListener('vite:preloadError', () => {
    window.location.reload();
  });
}

import 'virtual:vite-rsc-waku/client-entry';
