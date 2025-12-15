'use client';

import type { ReactNode } from 'react';
import type { AsyncLocalStorage } from 'node:async_hooks';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

const serverStyleSheetStorage = (
  globalThis as {
    __SERVER_STYLE_SHEET_STORAGE__?: AsyncLocalStorage<{
      sheet?: ServerStyleSheet;
    }>;
  }
).__SERVER_STYLE_SHEET_STORAGE__;

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
  let sheet: ServerStyleSheet | undefined;
  if (import.meta.env.SSR) {
    const store = serverStyleSheetStorage?.getStore();
    if (!store) {
      throw new Error('serverStyleSheetStorage is missing.');
    }
    sheet = store.sheet ??= new ServerStyleSheet();
  }
  return (
    <StyleSheetManager sheet={sheet?.instance}>{children}</StyleSheetManager>
  );
}
