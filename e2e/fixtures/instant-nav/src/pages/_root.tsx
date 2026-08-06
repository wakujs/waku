import type { ReactNode } from 'react';
import { ErrorBoundary } from 'waku/router/client';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <html>
        <head />
        <body>{children}</body>
      </html>
    </ErrorBoundary>
  );
}
