import * as ReactClient from '@vitejs/plugin-rsc/browser';
import { unstable_callServerRsc } from '../../minimal/client.js';
ReactClient.setServerCallback(unstable_callServerRsc);

if (import.meta.hot) {
  import.meta.hot.on('rsc:update', (e) => {
    console.log('[rsc:update]', e);
    (globalThis as any).__WAKU_RSC_RELOAD_LISTENERS__?.forEach((l: any) => l());
  });
}
