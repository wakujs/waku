'use client';

import type { ReactNode } from 'react';
import { useState } from 'react';
import { StyleRegistry, createStyleRegistry } from 'styled-jsx';
import { useServerInsertedHTML } from 'waku/server-html';

/**
 * styled-jsx registry for Waku SSR.
 *
 * @see https://github.com/vercel/styled-jsx
 */
export function StyledJsxRegistry({ children }: { children: ReactNode }) {
  const [jsxStyleRegistry] = useState(() => createStyleRegistry());

  useServerInsertedHTML(() => {
    const styles = jsxStyleRegistry.styles();
    jsxStyleRegistry.flush();
    return <>{styles}</>;
  });

  return <StyleRegistry registry={jsxStyleRegistry}>{children}</StyleRegistry>;
}
