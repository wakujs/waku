import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

const rootElement = (
  <StrictMode>
    <Router />
  </StrictMode>
);

createRoot(document, defaultRootOptions).render(rootElement);
