import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
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
  hydrateRoot(document, rootElement);
} else {
  createRoot(document).render(rootElement);
}
