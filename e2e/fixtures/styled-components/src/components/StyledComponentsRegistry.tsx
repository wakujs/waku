'use client';

import type { ReactNode } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';

export const StyledComponentsRegistry = ({
  children,
}: {
  children: ReactNode;
}) => {
  if (import.meta.env.SSR) {
    const sheet = new ServerStyleSheet();

    import('../server-html/context')
      .then(({ insertServerHTML }) => {
        insertServerHTML(() => {
          const styles = sheet.getStyleTags();
          sheet.instance.clearTag();
          return styles;
        });
      })
      .catch(() => {});

    return (
      <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>
    );
  }

  return <>{children}</>;
};
