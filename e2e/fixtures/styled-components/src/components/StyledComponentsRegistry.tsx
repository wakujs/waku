'use client';

import type { ReactNode } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

const serverStyleSheetStorage = (globalThis as any)
  .__SERVER_STYLE_SHEET_STORAGE__;

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
  // On the client, just render children directly
  if (typeof window !== 'undefined') {
    return <>{children}</>;
  }

  // On the server, wrap with StyleSheetManager to collect styles
  const store = serverStyleSheetStorage?.getStore();
  if (!store) {
    throw new Error('sheetStorage is empty.');
  }
  store.sheet ??= new ServerStyleSheet();
  return (
    <StyleSheetManager sheet={store.sheet.instance}>
      {children}
    </StyleSheetManager>
  );
}
