import type { ReactNode } from 'react';

export default function Root({ children }: { children: ReactNode }) {
  // TODO is there a more reasonable way?
  // eslint-disable-next-line react-hooks/purity
  const rand = Math.round(Math.random() * 100);
  return (
    <html>
      <head>
        <title>Waku</title>
      </head>
      <body data-dynamic-root={`Random Number ${rand}`}>{children}</body>
    </html>
  );
}

export const getConfig = async () => {
  return {
    render: 'dynamic',
  };
};
