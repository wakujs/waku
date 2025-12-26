import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Router } from './lib/my-router/MyRouter';

const rootElement = (
  <StrictMode>
    {/* <h1 suppressHydrationWarning>Fooooo</h1> */}
    <Router />
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
