import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const initialRoute = { path: '/', query: '', hash: '' };
const routeInterceptor = () => false as const;

const rootElement = (
  <StrictMode>
    <Router
      initialRoute={initialRoute}
      unstable_routeInterceptor={routeInterceptor}
    />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
