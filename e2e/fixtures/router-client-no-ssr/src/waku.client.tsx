import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Router } from 'waku/router/client';

// The managed client entry renders into `document`. A custom one may render
// into document.body instead, which `?__container=body` selects.
const container =
  new URLSearchParams(window.location.search).get('__container') === 'body'
    ? document.body
    : document;

createRoot(container, defaultRootOptions).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
