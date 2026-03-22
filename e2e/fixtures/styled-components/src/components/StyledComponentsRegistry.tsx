'use client';

import type { ReactNode } from 'react';
import { ServerStyleSheet, StyleSheetManager } from 'styled-components';
import { insertServerHTML } from '../server-html/client';

export const StyledComponentsRegistry = ({
  children,
}: {
  children: ReactNode;
}) => {
  if (import.meta.env.SSR) {
    const sheet = new ServerStyleSheet();

    insertServerHTML(() => {
      const styles = sheet.getStyleTags();
      sheet.instance.clearTag();
      return styles;
    });

    return (
      <StyleSheetManager sheet={sheet.instance}>{children}</StyleSheetManager>
    );
  }

  return <>{children}</>;
};
