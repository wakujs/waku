'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

const sheetStorage = (globalThis as any).__WAKU_STYLED_COMPONENTS_ALS__;

/**
 * Styled-components registry for Waku SSR.
 *
 * @see https://styled-components.com/docs/advanced#server-side-rendering
 */
export function StyledComponentsRegistry({
  children,
}: {
  children: ReactNode;
}) {
  // Only create stylesheet once with lazy initial state
  const [styledComponentsStyleSheet] = useState(() => new ServerStyleSheet());

  // On the client, just render children directly
  if (typeof window !== 'undefined') {
    return <>{children}</>;
  }

  // On the server, wrap with StyleSheetManager to collect styles
  const store = sheetStorage.getStore();
  if (!store) {
    throw new Error('sheetStorage is empty.');
  }
  store.sheet = styledComponentsStyleSheet;
  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  );
}
