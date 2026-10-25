import type { ReactNode } from 'react';

export default function DynamicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <nav>Dynamic Layout</nav>
      {children}
    </>
  );
}
