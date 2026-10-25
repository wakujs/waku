import type { ReactNode } from 'react';
import { Children_UNSTABLE as Children } from 'waku/minimal/client';
import { CookieInfo } from './cookie-info';
import { Island } from './island';
import { JotaiApp } from './jotai-app';
// eslint-disable-next-line import/no-unresolved
import { Counter } from '@/components/counter';

export function App({
  name,
  mode,
  rscParams,
  children,
}: {
  name: string;
  mode: 'basic' | 'children' | 'islands' | 'jotai' | 'cookie';
  rscParams?: unknown;
  children?: ReactNode;
}) {
  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku minimal examples</title>
      </head>
      <body>
        <h1 data-testid="title">Hello {name}</h1>
        {mode === 'basic' && <Counter />}
        {mode === 'children' && (
          <section>
            <p data-testid="children-marker">server children wrapper</p>
            <Children />
            {children}
          </section>
        )}
        {mode === 'islands' && <Island />}
        {mode === 'jotai' && <JotaiApp rscParams={rscParams} />}
        {mode === 'cookie' && <CookieInfo />}
      </body>
    </html>
  );
}
