'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

const useServerInsertedHTML = (_callback: () => ReactNode): void => {
  // TODO
  return;
};

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

  useServerInsertedHTML(() => {
    const styles = styledComponentsStyleSheet.getStyleElement();
    styledComponentsStyleSheet.instance.clearTag();
    return <>{styles}</>;
  });

  // On the client, just render children directly
  if (typeof window !== 'undefined') {
    return <>{children}</>;
  }

  // On the server, wrap with StyleSheetManager to collect styles
  return (
    <StyleSheetManager sheet={styledComponentsStyleSheet.instance}>
      {children}
    </StyleSheetManager>
  );
}
