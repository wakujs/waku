import { StrictMode, useEffect, useState } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { unstable_defaultRootOptions as defaultRootOptions } from 'waku/client';
import {
  Root_UNSTABLE as Root,
  Slot_UNSTABLE as Slot,
} from 'waku/minimal/client';

const ClientRoot = () => {
  const [key, setKey] = useState(0);
  useEffect(() => {
    const global = globalThis as typeof globalThis & {
      __WAKU_TEST_REMOUNT_ROOT__?: () => void;
    };
    global.__WAKU_TEST_REMOUNT_ROOT__ = () => setKey((prev) => prev + 1);
    return () => {
      delete global.__WAKU_TEST_REMOUNT_ROOT__;
    };
  }, []);
  return (
    <Root key={key}>
      <Slot id="App">
        <span data-testid="client-child">client child</span>
      </Slot>
    </Root>
  );
};

const rootElement = (
  <StrictMode>
    <ClientRoot />
  </StrictMode>
);

if ((globalThis as Record<string, unknown>).__WAKU_HYDRATE__) {
  hydrateRoot(document, rootElement, defaultRootOptions);
} else {
  createRoot(document, defaultRootOptions).render(rootElement);
}
