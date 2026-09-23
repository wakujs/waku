import type { PropsWithChildren } from 'react';

export default function Layout({ children }: PropsWithChildren) {
  return (
    <div>
      <title>Metadata Layout</title>
      <meta name="description" content="layout description" />
      <meta property="og:title" content="layout og title" />
      <meta property="og:site_name" content="layout og site name" />
      {children}
    </div>
  );
}
