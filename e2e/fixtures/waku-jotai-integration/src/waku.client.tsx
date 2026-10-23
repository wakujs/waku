import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';
import { createJotaiIntegration } from 'waku-jotai/router/client';

const jotai = createJotaiIntegration();
const enhancers = [jotai.rscEnhancer];
const app = (
  <StrictMode>
    <jotai.Provider>
      <Router unstable_rscEnhancers={enhancers} />
    </jotai.Provider>
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, app, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(app);
}
