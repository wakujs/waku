import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <title>Wildcard API Routes</title>
      </head>
      <body>{children}</body>
    </html>
  );
}
