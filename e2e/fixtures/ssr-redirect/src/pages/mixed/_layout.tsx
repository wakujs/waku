import type { ReactNode } from 'react';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <section>
      <h2>Static layout</h2>
      {children}
    </section>
  );
}

export const getConfig = async () => ({ render: 'static' }) as const;
