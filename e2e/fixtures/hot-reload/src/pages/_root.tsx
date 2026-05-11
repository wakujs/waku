import type { ReactNode } from 'react';
import appCss from '../styles.css?url';

export default async function Root({ children }: { children: ReactNode }) {
  return (
    <html>
      <head>
        <link rel="stylesheet" href={appCss} />
      </head>
      <body className="root-style">{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'static',
  } as const;
};
