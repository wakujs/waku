import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';
import { rerenderOrderEnhancer } from './components/rerender-order-client.js';

const enhancers = [rerenderOrderEnhancer];
const app = (
  <StrictMode>
    <Router unstable_rscEnhancers={enhancers} />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, app, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(app);
}
