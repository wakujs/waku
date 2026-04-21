import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import { Root, Slot } from 'waku/minimal/client';

const rootElement = (
  <StrictMode>
    <Root>
      <Slot id="App" />
    </Root>
  </StrictMode>
);

createRoot(document, defaultRootOptions).render(rootElement);
