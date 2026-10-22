import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import type { Unstable_RscEnhancer } from 'waku/minimal/client';
import { Router } from 'waku/router/client';

const wrapResponse: Unstable_RscEnhancer = (next) => (path, params, options) =>
  next(path, params, {
    ...options,
    fetch: async (input, init) => {
      const response = await options.fetch(input, init);
      return new Response(response.body, response);
    },
  });
const enhancers = new URLSearchParams(window.location.search).has('wrap-fetch')
  ? [wrapResponse]
  : [];
const app = (
  <StrictMode>
    <Router unstable_rscEnhancers={enhancers} />
  </StrictMode>
);

if ((globalThis as { __WAKU_HYDRATE__?: boolean }).__WAKU_HYDRATE__) {
  hydrateRoot(document, app, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(app);
}
