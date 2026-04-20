import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { defaultRootOptions } from 'waku/client';
import { Root, Slot } from 'waku/minimal/client';

const rootElement = (
  <StrictMode>
    <Root initialRscPath="">
      <Slot id="App" />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
