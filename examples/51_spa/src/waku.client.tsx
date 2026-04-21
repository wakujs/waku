import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import App from './components/App';

const rootElement = (
  <StrictMode>
    <App name="Client" />
  </StrictMode>
);

createRoot(document, defaultRootOptions).render(rootElement);
