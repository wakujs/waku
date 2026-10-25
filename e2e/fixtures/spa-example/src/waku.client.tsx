import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { App } from './components/app';

createRoot(document, defaultRootOptions).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
