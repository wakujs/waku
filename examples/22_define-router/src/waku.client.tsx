import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { defaultRootOptions } from 'waku/client';
import { ErrorBoundary, Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <ErrorBoundary>
      <Router />
    </ErrorBoundary>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
