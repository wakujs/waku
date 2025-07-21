import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { Root, Slot } from 'waku/minimal/client';

let rscPath = '';
let slotId = 'App';
if (window.location.pathname === '/test') {
  rscPath = 'test';
  slotId = 'TestApp';
}

const rootElement = (
  <StrictMode>
    <Root initialRscPath={rscPath}>
      <Slot id={slotId} />
    </Root>
  </StrictMode>
);

if ((globalThis as any).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement);
} else {
  createRoot(document as any).render(rootElement);
}
